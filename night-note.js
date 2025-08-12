document.addEventListener('DOMContentLoaded', () => {
    // --- Firebase ---
    const firebaseConfig = {
        apiKey: "AIzaSyAYUuNxsYWI59ahvjKHZujKyTfi9E8DzNwU",
        authDomain: "mywolf-game.firebaseapp.com",
        databaseURL: "https://mywolf-game-default-rtdb.asia-southeast1.firebasedatabase.app",
        projectId: "mywolf-game",
        storageBucket: "mywolf-game.appspot.com",
        messagingSenderId: "1099375631706",
        appId: "1:1099375631706:web:a1f6ccbcf71b7176046763"
    };
    firebase.initializeApp(firebaseConfig);
    const database = firebase.database();

    // --- Elements ---
    const roomIdDisplay = document.getElementById('room-id-display');
    const interactionTable = document.getElementById('player-interaction-table');
    const nightResultsDiv = document.getElementById('night-results');
    const nightTabsContainer = document.getElementById('night-tabs');
    const gmNoteArea = document.getElementById('gm-night-note');
    const gmNoteBtn = document.getElementById('save-gm-night-note-btn');
    const gmLogContent = document.getElementById('gm-log-content');
    const playerLogContent = document.getElementById('player-log-content');
    
    let votingSection, votePlayersList, startVoteBtn, endVoteBtn, voteResultsContainer, voteTimerInterval;
    let secretVoteWeights = {};
    let voteChoicesListener = null;
    let rememberedVoteWeights = {};

    let actionModal, currentActorInModal = null;
    let factionChangeModal = null;

    let groupModal, groupModalTitle, groupNameInput, groupModalPlayers, groupModalConfirmBtn, currentGroupEditingPlayerId;

    // --- Config ---
    const FACTIONS = [ "Bầy Sói", "Phe Sói", "Phe Dân", "Phe trung lập", "Chức năng khác", "Chưa phân loại" ];
    const FACTION_GROUPS = [
        { display: 'Bầy Sói', factions: ['Bầy Sói'], className: 'faction-wolf' },
        { display: 'Phe Sói', factions: ['Phe Sói'], className: 'faction-wolf' },
        { display: 'Phe Dân', factions: ['Phe Dân'], className: 'faction-villager' },
        { display: 'Phe trung lập', factions: ['Phe trung lập'], className: 'faction-neutral' },
        { display: 'Khác', factions: ['Chức năng khác', 'Chưa phân loại'], className: 'faction-other' }
    ];
    const SELECTABLE_FACTIONS = [ "Bầy Sói", "Phe Sói", "Phe Dân", "Phe trung lập" ];
    
    /**
     * === THAY ĐỔI 1: THÊM HÀNH ĐỘNG "NGUYỀN" ===
     */
    const KIND_TO_ACTION_MAP = {
        'shield': { key: 'protect', label: 'Bảo vệ', type: 'defense' },
        'save': { key: 'save', label: 'Cứu', type: 'defense' },
        'kill': { key: 'kill', label: 'Giết', type: 'damage' },
        'disable': { key: 'disable_action', label: 'Vô hiệu hóa', type: 'debuff' },
        'check': { key: 'check', label: 'Kiểm tra', type: 'info' },
        'audit': { key: 'audit', label: 'Soi phe Sói', type: 'info' },
        'invest': { key: 'invest', label: 'Điều tra', type: 'info' },
        'killwolf': { key: 'killwolf', label: 'Giết Sói', type: 'damage' },
        'killvillager': { key: 'killvillager', label: 'Giết Dân', type: 'damage' },
        'sacrifice': { key: 'sacrifice', label: 'Hy sinh', type: 'defense' },
        'checkcounter': { key: 'checkcounter', label: 'Đặt bẫy', type: 'debuff' },
        'checkdmg': { key: 'checkdmg', label: 'Liên kết', type: 'debuff' },
        'givekill': { key: 'givekill', label: 'Cho quyền giết', type: 'buff' },
        'givearmor': { key: 'givearmor', label: 'Cho giáp', type: 'buff' },
        'collect': { key: 'collect', label: 'Cải đạo', type: 'buff' },
        'transform': { key: 'transform', label: 'Biến hình', type: 'buff' },
        'choosesacrifier': { key: 'choosesacrifier', label: 'Chọn người thế mạng', type: 'buff' },
        'countershield': { key: 'countershield', label: 'Phá giáp', type: 'debuff'},
        'killdelay': { key: 'killdelay', label: 'Giết (trì hoãn)', type: 'damage' },
        'gather': { key: 'gather', label: 'Tụ tập', type: 'buff' },
        'killif': { key: 'killif', label: 'Giết/Cứu', type: 'conditional' },
        'noti': { key: 'noti', label: 'Đánh dấu', type: 'buff' },
        'curse': { key: 'curse', label: 'Nguyền', type: 'buff' }, // Hành động mới
    };

    let ALL_ACTIONS = {};

    // --- State ---
    let roomPlayers = [], allRolesData = {}, nightStates = [], activeNightIndex = 0, nextActionId = 0, roomId = null;
    let customPlayerOrder = [];

    // --- Data Fetching ---
    const fetchAllRolesData = async () => {
        try {
            const response = await fetch(`/api/sheets?sheetName=Roles`);
            if (!response.ok) throw new Error('Không thể tải dữ liệu vai trò.');
            const rawData = await response.json();
            
            allRolesData = rawData.reduce((acc, role) => {
                const roleName = (role.RoleName || '').trim();
                if (roleName) {
                    const quantityRaw = (role.Quantity || '1').toString().trim().toLowerCase();
                    let quantityValue;
                    if (quantityRaw === 'n') {
                        quantityValue = Infinity;
                    } else {
                        quantityValue = parseInt(quantityRaw, 10);
                        if (isNaN(quantityValue)) {
                            quantityValue = 1;
                        }
                    }

                    acc[roleName] = {
                        faction: (role.Faction || 'Chưa phân loại').trim(),
                        active: (role.Active || '0').trim(),
                        kind: (role.Kind || 'empty').trim(),
                        quantity: quantityValue
                    };
                }
                return acc;
            }, {});

            ALL_ACTIONS = Object.values(KIND_TO_ACTION_MAP).reduce((acc, action) => {
                acc[action.key] = action;
                return acc;
            }, {});
            ALL_ACTIONS['wolf_bite_group'] = { label: 'Sói cắn', type: 'damage' };
            ALL_ACTIONS['gm_kill'] = { label: 'Bị sát thương (GM)', type: 'damage' };
            ALL_ACTIONS['gm_protect'] = { label: 'Được bảo vệ (GM)', type: 'defense' };
            ALL_ACTIONS['gm_save'] = { label: 'Được cứu (GM)', type: 'defense' };
            ALL_ACTIONS['gm_add_armor'] = { label: 'Được 1 giáp (GM)', type: 'buff' };
            ALL_ACTIONS['gm_disable_night'] = { label: 'Bị vô hiệu hoá (1 Đêm)', type: 'debuff' };
            ALL_ACTIONS['gm_disable_perm'] = { label: 'Bị vô hiệu hoá (Vĩnh viễn)', type: 'debuff' };

        } catch (error) {
            console.error("Lỗi tải dữ liệu vai trò:", error);
            interactionTable.innerHTML = `<p style="color:red;">Lỗi: Không thể tải dữ liệu vai trò từ Google Sheet.</p>`;
        }
    };

    function saveNightNotes() {
        if (roomId) database.ref(`rooms/${roomId}/nightNotes`).set(nightStates);
    }
    
    function savePlayerOrder() {
        if (roomId) database.ref(`rooms/${roomId}/playerOrder`).set(customPlayerOrder);
    }

    function isActionCurrentlyAvailable(player, actionKey, currentNightIndex) {
        const rule = player.activeRule;
        const nightNumber = currentNightIndex + 1;

        if (!rule || rule === '0' || player.kind === 'empty') {
            return false;
        }

        const parts = rule.split('_');
        const usesRule = parts[0];
        const nightRule = parts.length > 1 ? parseInt(parts[1], 10) : null;

        if (nightRule !== null) {
            if (usesRule === '1') {
                if (nightNumber !== nightRule) return false;
            }
            else if (usesRule === 'n') {
                if (nightNumber < nightRule) return false;
            }
        }

        if (usesRule === '1') {
            let timesUsed = 0;
            for (const night of nightStates) {
                if (night.actions) {
                    timesUsed += night.actions.filter(a => a.actorId === player.id && a.action === actionKey).length;
                }
            }
            return timesUsed === 0;
        }

        return true;
    }

    // --- Logic ---
    /**
     * === THAY ĐỔI 2: XỬ LÝ LOGIC "NGUYỀN" ===
     */
    const calculateNightStatus = (nightState) => {
        if (!nightState) return { liveStatuses: {}, finalStatus: {}, deadPlayerNames: [], infoResults: [] };
        
        const actions = nightState.actions || [];
        const initialStatus = nightState.playersStatus;
        const finalStatus = JSON.parse(JSON.stringify(initialStatus));
        const liveStatuses = {}; 
        const infoResults = [];

        Object.keys(initialStatus).forEach(pId => {
            if (initialStatus[pId] && initialStatus[pId].isAlive) {
                liveStatuses[pId] = {
                    damage: 0, 
                    isProtected: false, 
                    isSaved: false,
                    isDisabled: initialStatus[pId].isDisabled || initialStatus[pId].isPermanentlyDisabled || false,
                    armor: initialStatus[pId].armor || 1,
                    isDoomed: initialStatus[pId].isDoomed || false,
                    delayKillAvailable: initialStatus[pId].delayKillAvailable !== false,
                    deathLinkTarget: initialStatus[pId].deathLinkTarget || null,
                    gatheredBy: null,
                    markedForDelayKill: initialStatus[pId].markedForDelayKill || false,
                    tempStatus: { hasKillAbility: false },
                    isSavedByKillif: false,
                    isNotified: false,
                    groupId: initialStatus[pId].groupId || null,
                };
                if (liveStatuses[pId].isDoomed) liveStatuses[pId].damage = 99;
                if (liveStatuses[pId].markedForDelayKill) liveStatuses[pId].damage = 99;
            }
        });

        const damageRedirects = {}; 
        const counterWards = {};    
        const counterShieldedTargets = new Set();
        const damageLinks = {};

        Object.keys(initialStatus).forEach(pId => {
            if(initialStatus[pId] && initialStatus[pId].sacrificedBy) {
                damageRedirects[pId] = initialStatus[pId].sacrificedBy;
            }
        });
        
        actions.forEach(({ actorId, targetId, action }) => {
            const actor = roomPlayers.find(p => p.id === actorId);
            if (!actor || (liveStatuses[actorId] && liveStatuses[actorId].isDisabled)) return;
            const actionKind = ALL_ACTIONS[action]?.key || action;
            if (actionKind === 'countershield') {
                counterShieldedTargets.add(targetId);
            }
        });

        actions.forEach(({ actorId, targetId, action }) => {
            const actor = roomPlayers.find(p => p.id === actorId);
            if (!actor) return; 
            
            const target = roomPlayers.find(p => p.id === targetId);
            const targetStatus = liveStatuses[targetId];
            if (!targetStatus) return;

            const actionKind = ALL_ACTIONS[action]?.key || action;
            
            if (actionKind === 'disable_action' && !liveStatuses[actorId]?.isDisabled) targetStatus.isDisabled = true;
            else if (actionKind === 'gm_add_armor') targetStatus.armor++;
            else if ((actionKind === 'protect' || actionKind === 'gm_protect') && !liveStatuses[actorId]?.isDisabled) {
                if(!counterShieldedTargets.has(targetId)) targetStatus.isProtected = true;
            }
            else if (actionKind === 'sacrifice'  && !liveStatuses[actorId]?.isDisabled) damageRedirects[targetId] = actorId;
            else if (actionKind === 'checkcounter'  && !liveStatuses[actorId]?.isDisabled) counterWards[targetId] = { actorId: actorId, triggered: false };
            else if (actionKind === 'checkdmg'  && !liveStatuses[actorId]?.isDisabled) {
                if (liveStatuses[actorId]) liveStatuses[actorId].deathLinkTarget = targetId;
            }
            else if (actionKind === 'givekill'  && !liveStatuses[actorId]?.isDisabled) targetStatus.tempStatus.hasKillAbility = true;
            else if (actionKind === 'givearmor'  && !liveStatuses[actorId]?.isDisabled) {
                targetStatus.armor = 2;
                if (liveStatuses[actorId]) liveStatuses[actorId].armor = 2;
                damageRedirects[targetId] = actorId;
            }
            else if (actionKind === 'choosesacrifier'  && !liveStatuses[actorId]?.isDisabled) {
                if (finalStatus[actorId]) {
                    finalStatus[actorId].sacrificedBy = targetId;
                    damageRedirects[actorId] = targetId;
                    infoResults.push(`- ${actor.roleName} (${actor.name}) đã chọn ${target.name} làm người thế mạng.`);
                }
            }
            else if (actionKind === 'collect'  && !liveStatuses[actorId]?.isDisabled) {
                if (finalStatus[targetId]) {
                    finalStatus[targetId].faction = actor.faction;
                    infoResults.push(`- ${actor.roleName} (${actor.name}) đã cải đạo ${target.name} sang ${actor.faction}.`);
                }
            }
            else if (actionKind === 'curse' && !liveStatuses[actorId]?.isDisabled) {
                if (finalStatus[targetId] && finalStatus[targetId].faction !== 'Bầy Sói') {
                    if (!finalStatus[targetId].originalRoleName) {
                        finalStatus[targetId].originalRoleName = target.roleName;
                    }
                    finalStatus[targetId].faction = 'Bầy Sói';
                    infoResults.push(`- Bầy Sói đã nguyền rủa ${target.name}, biến họ thành Sói.`);
                }
            }
            else if (actionKind === 'transform'  && !liveStatuses[actorId]?.isDisabled) {
                if (finalStatus[actorId]) {
                    if (roomPlayers.find(p => p.id === targetId)) {
                        finalStatus[actorId].transformedTo = roomPlayers.find(p => p.id === targetId).roleName;
                        infoResults.push(`- ${actor.roleName} (${actor.name}) đã biến thành ${finalStatus[actorId].transformedTo}.`);
                    }
                }
            }
            else if (actionKind === 'killdelay'  && !liveStatuses[actorId]?.isDisabled) {
                if (finalStatus[targetId]) {
                    finalStatus[targetId].markedForDelayKill = true;
                    infoResults.push(`- ${actor.roleName} (${actor.name}) đã nguyền rủa ${target.name}.`);
                }
            }
            else if (actionKind === 'gather'  && !liveStatuses[actorId]?.isDisabled) targetStatus.gatheredBy = actorId;
            else if (actionKind === 'noti'  && !liveStatuses[actorId]?.isDisabled) {
                targetStatus.isNotified = true;
                if (!damageLinks[targetId]) damageLinks[targetId] = [];
                damageLinks[targetId].push(actorId);
            }
        });
        
        const killifActions = actions.filter(({ action }) => (ALL_ACTIONS[action]?.key || action) === 'killif');
        const otherActions = actions.filter(({ action }) => (ALL_ACTIONS[action]?.key || action) !== 'killif');

        otherActions.forEach(({ actorId, targetId, action }) => {
            const attacker = roomPlayers.find(p => p.id === actorId);
            const target = roomPlayers.find(p => p.id === targetId);
            const actionKind = ALL_ACTIONS[action]?.key || action;

            if (actorId === 'wolf_group' || actionKind === 'gm_kill') {
                const finalTargetId = damageRedirects[targetId] || targetId;
                const targetStatus = liveStatuses[finalTargetId];
                if (targetStatus && !targetStatus.isProtected) targetStatus.damage++;
                return;
            }
            if (!attacker || !target || (liveStatuses[actorId] && liveStatuses[actorId].isDisabled)) return;
            
            const attackerHasKill = actionKind.includes('kill') || (liveStatuses[actorId] && liveStatuses[actorId].tempStatus.hasKillAbility);

            if (attackerHasKill && actionKind !== 'killdelay') {
                const finalTargetId = damageRedirects[targetId] || targetId;
                const finalTarget = roomPlayers.find(p => p.id === finalTargetId);
                const finalTargetStatus = liveStatuses[finalTargetId];
                
                if (!finalTarget || !finalTargetStatus || finalTargetStatus.isProtected) return;
                
                let shouldDamage = true;
                if(actionKind === 'killwolf' && !(finalTarget.faction === 'Bầy Sói' || finalTarget.faction === 'Phe Sói')) shouldDamage = false;
                if(actionKind === 'killvillager'){
                    if(finalTarget.roleName === 'Dân') shouldDamage = true;
                    else {
                        shouldDamage = false;
                        if (liveStatuses[actorId] && !liveStatuses[actorId].isProtected) liveStatuses[actorId].damage++;
                    }
                }
                
                if(shouldDamage) finalTargetStatus.damage++;
                
                if (finalTarget.kind === 'counter' && !liveStatuses[attacker.id].isProtected) {
                    if (liveStatuses[attacker.id]) liveStatuses[attacker.id].damage++;
                }
                if (finalTargetId !== targetId && !liveStatuses[attacker.id].isProtected) {
                     if (liveStatuses[attacker.id]) liveStatuses[attacker.id].damage++;
                }
                const ward = counterWards[finalTargetId];
                if (ward && !ward.triggered && !liveStatuses[attacker.id].isProtected) {
                    if (liveStatuses[attacker.id]) liveStatuses[attacker.id].damage++;
                    ward.triggered = true;
                }
            }
            
            if (actionKind === 'audit') {
                let isWolf = (target.faction === 'Bầy Sói' || target.faction === 'Phe Sói');
                if (target.kind.includes('reverse') || target.kind.includes('counteraudit')) isWolf = !isWolf;
                const result = isWolf ? "thuộc Phe Sói" : "KHÔNG thuộc Phe Sói";
                infoResults.push(`- ${attacker.roleName} (${attacker.name}) soi ${target.name}: ${result}.`);
            }
            if (actionKind === 'invest') {
                const result = (target.faction !== 'Phe Dân') ? "KHÔNG thuộc Phe Dân" : "thuộc Phe Dân";
                infoResults.push(`- ${attacker.roleName} (${attacker.name}) điều tra ${target.name}: ${result}.`);
            }
            if (actionKind === 'check') {
                infoResults.push(`- ${attacker.roleName} (${attacker.name}) đã kiểm tra ${target.name}.`);
            }
        });

        killifActions.forEach(({ actorId, targetId }) => {
            const attacker = roomPlayers.find(p => p.id === actorId);
            const target = roomPlayers.find(p => p.id === targetId);
            if (!attacker || !target || (liveStatuses[actorId] && liveStatuses[actorId].isDisabled)) return;
            
            const finalTargetId = damageRedirects[targetId] || targetId;
            const targetStatus = liveStatuses[finalTargetId];
    
            if (targetStatus) {
                if (targetStatus.damage > 0) {
                    targetStatus.isSavedByKillif = true;
                    infoResults.push(`- ${attacker.roleName} (${attacker.name}) đã CỨU ${target.name} (do mục tiêu đã bị tấn công).`);
                } else {
                    if(!targetStatus.isProtected) targetStatus.damage++;
                }
            }
        });

        const damageGroups = nightState.damageGroups || {};
        const groupDamageTotals = {};

        for (const groupId in damageGroups) {
            groupDamageTotals[groupId] = 0;
            const group = damageGroups[groupId];
            if (group && group.members) {
                group.members.forEach(memberId => {
                    if (liveStatuses[memberId]) {
                        groupDamageTotals[groupId] += liveStatuses[memberId].damage;
                    }
                });
            }
        }
        
        Object.keys(liveStatuses).forEach(pId => {
            const playerStatus = liveStatuses[pId];
            if (playerStatus.groupId && groupDamageTotals.hasOwnProperty(playerStatus.groupId)) {
                const totalGroupDamage = groupDamageTotals[playerStatus.groupId];
                if (!playerStatus.isProtected) {
                    playerStatus.damage = totalGroupDamage;
                }
            }
        });
        
        const gatherGroups = {};
        Object.keys(liveStatuses).forEach(pId => {
            const status = liveStatuses[pId];
            if(status.gatheredBy) {
                if(!gatherGroups[status.gatheredBy]) gatherGroups[status.gatheredBy] = [];
                gatherGroups[status.gatheredBy].push(pId);
            }
        });
        
        Object.values(gatherGroups).forEach(group => {
            let totalDamage = 0;
            group.forEach(pId => { totalDamage += liveStatuses[pId].damage; });
            group.forEach(pId => { liveStatuses[pId].damage = totalDamage; });
        });

        actions.forEach(({ actorId, targetId, action }) => {
             const actor = roomPlayers.find(p => p.id === actorId);
             if (!actor || (liveStatuses[actorId] && liveStatuses[actorId].isDisabled)) return;
             
             const actionKind = ALL_ACTIONS[action]?.key || action;
             if (actionKind.includes('save') || actionKind === 'gm_save') {
                 const targetStatus = liveStatuses[targetId];
                 if (targetStatus) {
                    if (actor.kind === 'save_gather' && targetStatus.gatheredBy) {
                        const groupToSave = gatherGroups[targetStatus.gatheredBy];
                        if (groupToSave) groupToSave.forEach(pId => { liveStatuses[pId].isSaved = true; });
                    } else {
                        targetStatus.isSaved = true;
                    }
                 }
             }
        });

        let deadPlayerIdsThisNight = new Set();
        const finalNightResolution = {};

        Object.keys(liveStatuses).forEach(pId => {
            const status = liveStatuses[pId];
            finalNightResolution[pId] = {
                effectiveDamage: status.damage,
                armor: status.armor,
                isSaved: status.isSaved || status.isSavedByKillif
            };
        });

        Object.keys(damageLinks).forEach(sourceId => {
            if (finalNightResolution[sourceId]) {
                const damageToTransfer = finalNightResolution[sourceId].effectiveDamage;
                if (damageToTransfer > 0) {
                    damageLinks[sourceId].forEach(receiverId => {
                        if (finalNightResolution[receiverId]) {
                            finalNightResolution[receiverId].effectiveDamage += damageToTransfer;
                            infoResults.push(`- ${roomPlayers.find(p=>p.id===receiverId).name} nhận sát thương chung từ ${roomPlayers.find(p=>p.id===sourceId).name}.`);
                        }
                    });
                }
            }
        });
        
        Object.keys(finalNightResolution).forEach(pId => {
            const res = finalNightResolution[pId];
            const player = roomPlayers.find(p => p.id === pId);
            if (!player) return; 

            let finalDamage = res.effectiveDamage;

            if (finalDamage > 0 && res.armor > 1) {
                const damageAbsorbed = Math.min(finalDamage, res.armor - 1);
                res.armor -= damageAbsorbed;
                finalDamage -= damageAbsorbed;
            }
            
            if (finalDamage > 0 && !res.isSaved) {
                if (liveStatuses[pId]) liveStatuses[pId].isDead = true;

                if (player.kind === 'delaykill' && liveStatuses[pId].delayKillAvailable) {
                    finalStatus[pId].isDoomed = true;
                    finalStatus[pId].delayKillAvailable = false;
                } else {
                    finalStatus[pId].isAlive = false;
                    deadPlayerIdsThisNight.add(pId);
                }
            }

            if (finalStatus[pId]) {
                finalStatus[pId].armor = res.armor;
                if (liveStatuses[pId].deathLinkTarget) finalStatus[pId].deathLinkTarget = liveStatuses[pId].deathLinkTarget;
                if (liveStatuses[pId].groupId) finalStatus[pId].groupId = liveStatuses[pId].groupId;
                if (initialStatus[pId].isPermanentlyDisabled) finalStatus[pId].isPermanentlyDisabled = true;
            }
        });
        
        let chainReactionOccurred = true;
        while(chainReactionOccurred) {
            chainReactionOccurred = false;
            const newlyDead = [];
            roomPlayers.forEach(player => {
                if (deadPlayerIdsThisNight.has(player.id) && finalStatus[player.id] && finalStatus[player.id].deathLinkTarget) {
                    const linkedTargetId = finalStatus[player.id].deathLinkTarget;
                    if (finalStatus[linkedTargetId] && finalStatus[linkedTargetId].isAlive) {
                        finalStatus[linkedTargetId].isAlive = false;
                        newlyDead.push(linkedTargetId);
                        chainReactionOccurred = true;
                    }
                }
            });
            newlyDead.forEach(id => deadPlayerIdsThisNight.add(id));
        }

        const deadPlayerNames = Array.from(deadPlayerIdsThisNight).map(id => roomPlayers.find(p => p.id === id)?.name).filter(Boolean);
        
        return { liveStatuses, finalStatus, deadPlayerNames, infoResults };
    };
    
    // --- Log Builder Functions ---
    function buildGmActionLog(nightState) {
        const gmActions = [];
        if (Array.isArray(nightState.factionChanges)) {
            nightState.factionChanges.forEach(change => {
                const player = roomPlayers.find(p => p.id === change.playerId);
                const name = player ? `<strong class="player-name">${player.name}</strong>` : "???";
                const oldFaction = player ? player.baseFaction : "?";
                gmActions.push(`Đã đổi phe của ${name} (từ ${oldFaction}) thành <strong class="faction-name">${change.newFaction}</strong>.`);
            });
        }

        const gmManualActions = (nightState.actions || []).filter(a => a.action.startsWith('gm_'));
        gmManualActions.forEach(({ action, targetId }) => {
            const target = roomPlayers.find(p => p.id === targetId);
            const targetName = target ? `<strong class="player-name">${target.name}</strong>` : '???';
            const actionLabel = ALL_ACTIONS[action]?.label || action;
            gmActions.push(`Áp dụng hiệu ứng "${actionLabel}" lên ${targetName}.`);
        });

        if (gmActions.length === 0) {
            return '<p class="log-placeholder">Chưa có hoạt động nào từ quản trò.</p>';
        }
        return gmActions.map(log => `<div class="log-item gm-action">- ${log}</div>`).join('');
    }

    function buildPlayerActionLog(nightState, infoResults) {
        const playerActions = [];
        const actions = nightState.actions || [];

        const regularActions = actions.filter(a => !a.action.startsWith('gm_'));

        regularActions.forEach(({ action, targetId, actorId }) => {
            const actor = roomPlayers.find(p => p.id === actorId);
            const target = roomPlayers.find(p => p.id === targetId);
            const actorName = actor ? `<strong class="player-name">${actor.name}</strong> <span class="role-name">(${actor.roleName || '???'})</span>` : '<strong>Bầy Sói</strong>';
            const targetName = target ? `<strong class="target-name">${target.name}</strong>` : "???";
            const actionLabel = ALL_ACTIONS[action]?.label || action;

            playerActions.push(`${actorName} đã chọn <strong>${actionLabel}</strong> ${targetName}.`);
        });

        if (playerActions.length === 0 && infoResults.length === 0) {
            return '<p class="log-placeholder">Chưa có hoạt động nào từ người chơi.</p>';
        }

        let html = playerActions.map(log => `<div class="log-item player-action">${log}</div>`).join('');
        html += infoResults.map(log => `<div class="log-item info-result">${log}</div>`).join('');
        return html;
    }

    function initializeSortable() {
        const factionGroups = document.querySelectorAll('.faction-player-list');
        factionGroups.forEach(groupEl => {
            new Sortable(groupEl, {
                animation: 150,
                ghostClass: 'sortable-ghost',
                delay: 150,
                delayOnTouchOnly: true,
                onEnd: function (evt) {
                    const allPlayerIdsInOrder = Array.from(interactionTable.querySelectorAll('.player-row')).map(row => row.dataset.playerId).filter(id => id);
                    
                    customPlayerOrder = allPlayerIdsInOrder;
                    savePlayerOrder();
                }
            });
        });
    }

    // --- Rendering ---
    const render = () => {
        interactionTable.innerHTML = '';
        const nightState = nightStates[activeNightIndex];
        if (!nightState) {
            interactionTable.innerHTML = '<div class="loading-spinner"></div>';
            return;
        }

        // Cập nhật phe của người chơi tạm thời để render cho đúng
        roomPlayers.forEach(p => {
            const playerStatus = nightState.playersStatus[p.id];
            if (playerStatus && playerStatus.faction) {
                p.faction = playerStatus.faction;
            } else {
                p.faction = p.baseFaction;
            }
        });

        const { liveStatuses, infoResults, deadPlayerNames } = calculateNightStatus(nightState);
        
        if (nightState.isFinished) {
            nightResultsDiv.innerHTML = deadPlayerNames.length > 0
                    ? `<strong>Đã chết:</strong> ${deadPlayerNames.map(name => `<span class="dead-player">${name}</span>`).join(', ')}`
                    : '<p>Không có ai chết trong đêm nay.</p>';
        } else {
            nightResultsDiv.innerHTML = deadPlayerNames.length > 0
                ? `<strong>Dự kiến chết:</strong> ${deadPlayerNames.map(name => `<span class="dead-player">${name}</span>`).join(', ')}`
                : '<p>Không có ai chết trong đêm nay.</p>';
        }
        
        gmNoteArea.value = nightState.gmNote || "";
        gmLogContent.innerHTML = buildGmActionLog(nightState);
        playerLogContent.innerHTML = buildPlayerActionLog(nightState, infoResults);

        let sortedPlayers = [...roomPlayers];
        if (customPlayerOrder && customPlayerOrder.length > 0) {
             sortedPlayers.sort((a, b) => {
                const indexA = customPlayerOrder.indexOf(a.id);
                const indexB = customPlayerOrder.indexOf(b.id);
                if (indexA === -1) return 1;
                if (indexB === -1) return -1;
                return indexA - indexB;
            });
        }

        FACTION_GROUPS.forEach(group => {
            const groupPlayers = sortedPlayers.filter(p => group.factions.includes(p.faction));
            if (groupPlayers.length === 0) return;
            
            const wrapper = document.createElement('div');
            wrapper.className = `faction-group-wrapper ${group.className || ''}`;

            const header = document.createElement('div');
            header.className = `faction-header ${group.className || ''}`;
            header.textContent = group.display;
            wrapper.appendChild(header);

            if (group.factions.includes('Bầy Sói')) {
                wrapper.appendChild(createWolfGroupRow(nightState, nightState.isFinished));
            }
            
            const playerListContainer = document.createElement('div');
            playerListContainer.className = 'faction-player-list';

            groupPlayers.forEach(player => {
                const playerState = nightState.playersStatus[player.id];
                const lStatus = liveStatuses ? liveStatuses[player.id] : null;
                if (playerState) {
                    playerListContainer.appendChild(createPlayerRow(player, playerState, lStatus, nightState.isFinished));
                }
            });

            wrapper.appendChild(playerListContainer);
            interactionTable.appendChild(wrapper);
        });
        
        initializeSortable();
        renderNightTabs();

        let deleteBtn = document.getElementById('delete-nightnote-btn');
        if (!deleteBtn) {
            deleteBtn = document.createElement('button');
            deleteBtn.id = "delete-nightnote-btn";
            deleteBtn.className = "btn-danger";
            deleteBtn.textContent = "Xóa Night Note";
            deleteBtn.style.marginBottom = "10px";
            interactionTable.parentNode.insertBefore(deleteBtn, interactionTable);
            deleteBtn.addEventListener('click', function() {
                if (confirm('Bạn có chắc chắn muốn xóa toàn bộ night note không?')) {
                    nightStates = [];
                    activeNightIndex = 0;
                    saveNightNotes();
                    database.ref(`rooms/${roomId}/playerOrder`).set(null);
                }
            });
        }
        
        renderVotingModule();
    };
    
    function createPlayerRow(player, playerState, liveStatus, isFinished) {
        const row = document.createElement('div');
        row.className = 'player-row';
        row.dataset.playerId = player.id;

        if (!playerState.isAlive) {
            row.classList.add('status-dead');
        } else if (liveStatus) {
            if (liveStatus.isProtected) row.classList.add('status-protected');
            if (liveStatus.isSaved) row.classList.add('status-saved');
            if (liveStatus.isDead) row.classList.add('status-danger');
            if (liveStatus.isDisabled) row.classList.add('status-disabled-by-ability');
        }
        if (playerState.isDisabled) row.classList.add('status-disabled');
        if (playerState.isPermanentlyDisabled) row.classList.add('status-permanently-disabled');
        
        // Thêm class nếu người chơi bị nguyền
        if (playerState.originalRoleName) {
            row.classList.add('status-cursed');
        }

        let actionDisplayHTML = buildActionList(player.id, nightStates[activeNightIndex]);
        
        let statusIconsHTML = '';
        if (liveStatus) {
            if (liveStatus.isProtected) statusIconsHTML += '<i class="fas fa-shield-alt icon-protected" title="Được bảo vệ"></i>';
            if (liveStatus.isSaved) statusIconsHTML += '<i class="fas fa-plus-square icon-saved" title="Được cứu"></i>';
            if (liveStatus.isDead) statusIconsHTML += '<i class="fas fa-skull-crossbones icon-danger" title="Dự kiến chết"></i>';
            if (liveStatus.isDisabled) statusIconsHTML += '<i class="fas fa-exclamation-triangle icon-disabled-by-ability" title="Bị vô hiệu hóa"></i>';
            if (liveStatus.armor > 1) statusIconsHTML += `<i class="fas fa-shield-alt icon-armor" title="Có ${liveStatus.armor - 1} giáp"></i>`;
            if (liveStatus.isNotified) statusIconsHTML += '<i class="fas fa-bell icon-notified" title="Bị đánh dấu"></i>';
        }

        let groupTagHTML = '';
        const nightState = nightStates[activeNightIndex];
        if (playerState.groupId && nightState.damageGroups && nightState.damageGroups[playerState.groupId]) {
            const groupName = nightState.damageGroups[playerState.groupId].name;
            groupTagHTML = `<span class="player-group-tag" title="Nhóm: ${groupName}">${playerState.groupId}</span>`;
        }

        // Hiển thị vai trò gốc nếu bị nguyền
        const roleDisplayName = playerState.originalRoleName 
            ? `${playerState.originalRoleName} <span class="cursed-note">(thành Sói)</span>`
            : (player.roleName || 'Chưa có vai');

        row.innerHTML = `
            <div class="player-header">
                <div class="player-info">
                    <div class="player-name-wrapper">
                        ${groupTagHTML}
                        <div class="player-name">${player.name}</div>
                    </div>
                    <div class="player-role">${roleDisplayName}</div>
                </div>
                <div class="player-controls">
                    <div class="status-icons">${statusIconsHTML}</div>
                    ${!isFinished && playerState.isAlive ? `
                        <button class="action-modal-btn" data-player-id="${player.id}">Action</button>
                        <button class="action-modal-btn group-btn" data-player-id="${player.id}">Link</button>
                    ` : ''}
                    <div class="player-status-icon life ${playerState.isAlive ? 'alive' : 'dead'}" title="Sống/Chết"><i class="fas fa-heart"></i></div>
                </div>
            </div>
            <div class="action-display-list">${actionDisplayHTML}</div>
        `;
        
        return row;
    }

    /**
     * === THAY ĐỔI 3: CẬP NHẬT GIAO DIỆN BẦY SÓI ===
     */
    function createWolfGroupRow(nightState, isFinished) {
        const row = document.createElement('div');
        row.className = 'player-row';
        
        let actionDisplayHTML = buildActionList('wolf_group', nightState);

        row.innerHTML = `
            <div class="player-header">
                <div class="player-info">
                    <div class="player-name">Hành Động Chung</div>
                    <div class="player-role">(Bầy Sói)</div>
                </div>
                <div class="player-controls">
                     ${!isFinished ? `
                        <button class="action-modal-btn wolf-bite-btn" data-player-id="wolf_group" data-wolf-action="bite">Cắn</button>
                        <button class="action-modal-btn wolf-curse-btn" data-player-id="wolf_group" data-wolf-action="curse">Nguyền</button>
                     ` : ''}
                </div>
            </div>
            <div class="action-display-list">${actionDisplayHTML}</div>
        `;
        return row;
    }
    
    function buildActionList(playerId, nightState) {
        let html = '';
        if (nightState && Array.isArray(nightState.actions)) {
            const playerActions = nightState.actions.filter(action => action.actorId === playerId);
            if(playerActions.length > 0){
                playerActions.forEach(action => {
                    const target = roomPlayers.find(p => p.id === action.targetId);
                    const actionConfig = ALL_ACTIONS[action.action];
                    const actionLabel = actionConfig?.label || action.action;
                    html += `<div class="action-display-item">
                                <i class="fas fa-arrow-right"></i> ${actionLabel} <strong>${target?.name || ''}</strong>
                                <button class="remove-action-btn" data-action-id="${action.id}">&times;</button>
                             </div>`;
                });
            }
        }
        return html;
    }

    const renderNightTabs = () => {
        nightTabsContainer.innerHTML = '';
        nightStates.forEach((_, index) => {
            const tab = document.createElement('button');
            tab.className = 'night-tab';
            if (index === activeNightIndex) tab.classList.add('active');
            tab.textContent = `Đêm ${index + 1}`;
            tab.dataset.index = index;
            nightTabsContainer.appendChild(tab);
        });
        const addNightBtn = document.createElement('button');
        addNightBtn.id = "add-night-btn";
        addNightBtn.className = "btn-add-night";
        addNightBtn.innerHTML = '<i class="fas fa-plus"></i> Thêm Đêm';
        nightTabsContainer.appendChild(addNightBtn);
    };
    
    function createVotingModuleStructure() {
        if (document.getElementById('voting-section')) return;

        const mainContainer = document.querySelector('.container');
        if (!mainContainer) {
            console.error("Lỗi nghiêm trọng: Không tìm thấy '.container' để chèn module vote.");
            return;
        }
        const logSection = document.getElementById('night-logs-section');

        const votingModuleEl = document.createElement('div');
        votingModuleEl.id = 'voting-section';
        votingModuleEl.className = 'card';
        votingModuleEl.innerHTML = `
            <h2><i class="fas fa-gavel"></i> Dàn Xử Án</h2>
            <div class="voting-controls">
                <input type="text" id="vote-title-input" placeholder="Tiêu đề (ví dụ: Vote treo cổ ngày 1)" value="Vote treo cổ">
                <input type="number" id="vote-timer-input" value="60" min="10" title="Thời gian vote (giây)">
                <button id="start-vote-btn" class="btn-special">Bắt Đầu Vote</button>
                <button id="end-vote-btn" class="btn-danger" style="display: none;">Kết Thúc Vote Ngay</button>
                <span id="gm-vote-timer-display" class="gm-timer-display"></span>
            </div>
            <div id="vote-players-list"></div>
            <div id="vote-results-container" style="display: none;">
                <h3>Kết Quả Vote</h3>
                <div id="vote-results-summary"></div>
                <div id="vote-results-details"></div>
            </div>
        `;

        startVoteBtn = votingModuleEl.querySelector('#start-vote-btn');
        endVoteBtn = votingModuleEl.querySelector('#end-vote-btn');
        startVoteBtn.addEventListener('click', handleStartVote);
        endVoteBtn.addEventListener('click', handleEndVote);
        
        votingSection = votingModuleEl;
        votePlayersList = votingModuleEl.querySelector('#vote-players-list');
        voteResultsContainer = votingModuleEl.querySelector('#vote-results-container');
        
        votePlayersList.addEventListener('click', (e) => {
            if (e.target.classList.contains('weight-btn')) {
                const playerId = e.target.dataset.playerId;
                const display = document.getElementById(`weight-display-${playerId}`);
                if (!display) return;
                
                let currentValue = parseInt(display.textContent, 10);
                if (e.target.classList.contains('plus')) {
                    currentValue++;
                } else if (e.target.classList.contains('minus')) {
                    currentValue = Math.max(0, currentValue - 1);
                }
                display.textContent = currentValue;
                
                rememberedVoteWeights[playerId] = currentValue;
            }
        });

        if (logSection) {
            logSection.parentNode.insertBefore(votingModuleEl, logSection.nextSibling);
        } else {
             mainContainer.appendChild(votingModuleEl);
        }
       
    }

    function renderVotingModule() {
        createVotingModuleStructure();

        const lastNight = nightStates[nightStates.length - 1];
        if (!lastNight || !votePlayersList) return;

        const { finalStatus } = calculateNightStatus(lastNight);
        const livingPlayers = roomPlayers.filter(p => finalStatus[p.id]?.isAlive);

        votePlayersList.innerHTML = '<h4>Thiết lập phiếu vote:</h4>';
        if (livingPlayers.length > 0) {
            livingPlayers.sort((a,b) => a.name.localeCompare(b.name)).forEach(player => {
                const playerRow = document.createElement('div');
                playerRow.className = 'vote-player-row';
                const currentWeight = rememberedVoteWeights[player.id] ?? 1;
                
                playerRow.innerHTML = `
                    <span class="vote-player-name">${player.name} (${player.roleName || 'Chưa rõ'})</span>
                    <div class="vote-weight-controls">
                        <button class="weight-btn minus" data-player-id="${player.id}" title="Giảm phiếu">-</button>
                        <span class="vote-weight-display" id="weight-display-${player.id}">${currentWeight}</span>
                        <button class="weight-btn plus" data-player-id="${player.id}" title="Tăng phiếu">+</button>
                    </div>
                `;
                votePlayersList.appendChild(playerRow);
            });
        } else {
            votePlayersList.innerHTML += '<p>Không có người chơi nào còn sống để vote.</p>';
        }
    }

    function handleStartVote() {
        if (!roomId) return;

        secretVoteWeights = {};
        const voteWeightDisplays = document.querySelectorAll('.vote-weight-display');
        voteWeightDisplays.forEach(display => {
            const playerId = display.id.replace('weight-display-', '');
            const weight = parseInt(display.textContent, 10);
            if (playerId && !isNaN(weight)) {
                secretVoteWeights[playerId] = weight;
            }
        });

        const lastNight = nightStates[nightStates.length - 1];
        if (!lastNight) {
            alert("Lỗi: Không tìm thấy dữ liệu đêm cuối.");
            return;
        }
        const { finalStatus } = calculateNightStatus(lastNight);
        const livingPlayers = roomPlayers.filter(p => finalStatus[p.id]?.isAlive);

        const candidates = livingPlayers.reduce((acc, p) => {
            acc[p.id] = p.name;
            return acc;
        }, {});
        
        const title = document.getElementById('vote-title-input').value || 'Vote';
        const timerSeconds = parseInt(document.getElementById('vote-timer-input').value, 10) || 60;
        const endTime = Date.now() + (timerSeconds * 1000);

        const votingState = {
            status: 'active',
            title: title,
            endTime: endTime, 
            candidates: candidates,
            choices: null
        };

        const voteRef = database.ref(`rooms/${roomId}/votingState`);
        voteRef.set(votingState).then(() => {
            startVoteBtn.style.display = 'none';
            endVoteBtn.style.display = 'inline-block';
            voteResultsContainer.style.display = 'grid';
            voteResultsContainer.querySelector('#vote-results-summary').innerHTML = 'Đang chờ người chơi vote...';
            voteResultsContainer.querySelector('#vote-results-details').innerHTML = '';

            const gmTimerDisplay = document.getElementById('gm-vote-timer-display');
            gmTimerDisplay.style.display = 'inline';

            if (voteTimerInterval) clearInterval(voteTimerInterval);
            voteTimerInterval = setInterval(() => {
                const remaining = Math.round((endTime - Date.now()) / 1000);
                if (remaining > 0) {
                    gmTimerDisplay.textContent = `Thời gian: ${remaining}s`;
                } else {
                    gmTimerDisplay.textContent = "Hết giờ!";
                    handleEndVote(); 
                }
            }, 1000);

            const choicesRef = database.ref(`rooms/${roomId}/votingState/choices`);
            if(voteChoicesListener) choicesRef.off('value', voteChoicesListener);
            
            voteChoicesListener = choicesRef.on('value', (snapshot) => {
                const choices = snapshot.val() || {};
                renderVoteResults(choices, secretVoteWeights);
            });
        });
    }

    function handleEndVote() {
        if (!roomId) return;
        
        database.ref(`rooms/${roomId}/votingState/status`).once('value', (snapshot) => {
            if (snapshot.val() === 'active') {
                database.ref(`rooms/${roomId}/votingState/status`).set('finished');
                alert("Vote đã kết thúc!");
            }
        });
        
        const choicesRef = database.ref(`rooms/${roomId}/votingState/choices`);
        if (voteChoicesListener) {
            choicesRef.off('value', voteChoicesListener);
            voteChoicesListener = null;
        }

        if (voteTimerInterval) {
            clearInterval(voteTimerInterval);
            voteTimerInterval = null;
        }

        const gmTimerDisplay = document.getElementById('gm-vote-timer-display');
        if (gmTimerDisplay) gmTimerDisplay.style.display = 'none';

        startVoteBtn.style.display = 'inline-block';
        endVoteBtn.style.display = 'none';
    }

    function renderVoteResults(choices, weights) {
        if (!voteResultsContainer) return;
        
        const lastNight = nightStates[nightStates.length - 1];
        if (!lastNight) return;
        const { finalStatus } = calculateNightStatus(lastNight);
        const livingPlayers = roomPlayers.filter(p => finalStatus[p.id]?.isAlive);
        
        let detailsHtml = '<h4>Chi tiết:</h4><ul>';
        livingPlayers.sort((a,b) => a.name.localeCompare(b.name)).forEach(voter => {
            const choice = choices ? choices[voter.name] : null;
            let targetName;
            
            if (choice === 'skip_vote') {
                targetName = 'Bỏ qua';
            } else if (choice) {
                targetName = roomPlayers.find(p => p.id === choice)?.name || 'Không rõ';
            } else {
                targetName = '<em style="opacity: 0.7">Chưa bỏ phiếu</em>';
            }
            
            const weight = weights[voter.id] || 0;
            detailsHtml += `<li><strong>${voter.name}</strong> (x${weight}) → <strong>${targetName}</strong></li>`;
        });
        detailsHtml += '</ul>';
        voteResultsContainer.querySelector('#vote-results-details').innerHTML = detailsHtml;

        const tally = {};
        livingPlayers.forEach(p => tally[p.id] = 0);
        tally['skip_vote'] = 0;

        livingPlayers.forEach(voter => {
            const choice = choices ? choices[voter.name] : null;
            const weight = weights[voter.id] || 0;

            if (!choice || choice === 'skip_vote') {
                tally['skip_vote'] += weight;
            } else {
                if (tally.hasOwnProperty(choice)) {
                    tally[choice] += weight;
                }
            }
        });
        
        let maxVotes = -1;
        let mostVotedPlayers = [];
        
        for(const targetId in tally) {
            if (targetId !== 'skip_vote') {
                if (tally[targetId] > maxVotes) {
                    maxVotes = tally[targetId];
                    mostVotedPlayers = [targetId];
                } else if (tally[targetId] === maxVotes && maxVotes > 0) {
                     mostVotedPlayers.push(targetId);
                }
            }
        }

        let summaryHtml = '<h4>Thống kê phiếu:</h4><ul>';
        const sortedTally = Object.entries(tally).sort(([,a],[,b]) => b-a);

        sortedTally.forEach(([targetId, count]) => {
            const isMostVoted = mostVotedPlayers.includes(targetId) && count > 0;
            const targetName = targetId === 'skip_vote' ? 'Bỏ qua' : (roomPlayers.find(p => p.id === targetId)?.name || 'Không rõ');
            summaryHtml += `<li ${isMostVoted ? 'class="most-voted"' : ''}>${targetName}: <strong>${count}</strong> phiếu</li>`;
        });
        summaryHtml += '</ul>';
        voteResultsContainer.querySelector('#vote-results-summary').innerHTML = summaryHtml;
    }

    /**
     * === THAY ĐỔI 4: XỬ LÝ SỰ KIỆN CLICK CHO NÚT MỚI CỦA SÓI ===
     */
    const handleEvents = (e) => {
        const target = e.target;
        
        if (target.matches('.action-modal-btn')) {
            const playerId = target.dataset.playerId;
            if (target.classList.contains('group-btn')) {
                openGroupModal(playerId);
                return;
            }

            let actor;
            if (playerId === 'wolf_group') {
                const wolfAction = target.dataset.wolfAction;
                if (wolfAction === 'bite') {
                    actor = { id: 'wolf_group', name: 'Bầy Sói', roleName: 'Hành động chung', kind: 'kill', quantity: Infinity, activeRule: 'n' };
                } else if (wolfAction === 'curse') {
                    // Giả sử Nguyền có thể dùng mỗi đêm, chọn 1 mục tiêu
                    actor = { id: 'wolf_group', name: 'Bầy Sói', roleName: 'Hành động chung', kind: 'curse', quantity: 1, activeRule: 'n' };
                }
            } else {
                actor = roomPlayers.find(p => p.id === playerId);
            }

            if (actor) {
                openActionModal(actor);
            }
            return;
        }

        if (target.matches('.remove-action-btn')) {
            const actionId = parseInt(target.dataset.actionId, 10);
            const nightState = nightStates[activeNightIndex];
            if (nightState && nightState.actions) {
                nightState.actions = nightState.actions.filter(a => a.id !== actionId);
                saveNightNotes();
            }
            return;
        }

        const nightState = nightStates[activeNightIndex];
        if (target.closest('.player-status-icon.life')) {
            const actorId = target.closest('.player-row').dataset.playerId;
             if (nightState && !nightState.isFinished) {
                 nightState.playersStatus[actorId].isAlive = !nightState.playersStatus[actorId].isAlive;
                 saveNightNotes();
             }
            return;
        }

        if (target.closest('#add-night-btn')) {
            const lastNight = nightStates[nightStates.length - 1];
            if (lastNight && !lastNight.isFinished) {
                alert(`Vui lòng kết thúc Đêm ${nightStates.length} trước khi thêm đêm mới.`);
                return;
            }
            const prevStatus = lastNight ? calculateNightStatus(lastNight).finalStatus : Object.fromEntries(roomPlayers.map(p => {
                return [p.id, { 
                    isAlive: true, 
                    isDisabled: false, 
                    isPermanentlyDisabled: false,
                    armor: (p.kind === 'armor1' ? 2 : 1),
                    delayKillAvailable: (p.kind === 'delaykill'),
                    isDoomed: false,
                    deathLinkTarget: null,
                    sacrificedBy: null,
                    transformedTo: null,
                    markedForDelayKill: false,
                    groupId: null,
                }];
            }));
            
            Object.keys(prevStatus).forEach(pId => {
                if(prevStatus[pId]) prevStatus[pId].isDisabled = false;
            });
            
            const initialStatusForNewNight = JSON.parse(JSON.stringify(prevStatus));
            nightStates.push({
                actions: [],
                playersStatus: initialStatusForNewNight,
                initialPlayersStatus: JSON.parse(JSON.stringify(initialStatusForNewNight)),
                isFinished: false,
                gmNote: "",
                damageGroups: lastNight ? (lastNight.damageGroups || {}) : {},
                factionChanges: []
            });
            activeNightIndex = nightStates.length - 1;
            saveNightNotes();
            return;
        }

        if (!nightState) return;
        if (!Array.isArray(nightState.actions)) {
            nightState.actions = [];
        }

        if (target.closest('.night-tab')) {
            activeNightIndex = parseInt(target.closest('.night-tab').dataset.index, 10);
            render();
        } 
        else if (target.closest('#reset-night-btn')) {
            if (confirm(`Bạn có chắc muốn làm mới mọi hành động và trạng thái Sống/Chết trong Đêm ${activeNightIndex + 1}?`)) {
                nightState.actions = [];
                nightState.isFinished = false;
                nightState.factionChanges = [];
                nightState.playersStatus = JSON.parse(JSON.stringify(nightState.initialPlayersStatus));
                
                recalculateAllPlayerFactions();
                
                nightState.damageGroups = {};
                saveNightNotes();
            }
        } else if (target.closest('#end-night-btn')) {
            if (!nightState.isFinished && confirm(`Bạn có chắc muốn kết thúc Đêm ${activeNightIndex + 1}?`)) {
                nightState.isFinished = true;
                saveNightNotes();
            }
        }
    };
    
    function renderTargetsForSelectedAction() {
        if (!currentActorInModal) return;

        const nightState = nightStates[activeNightIndex];
        const livingPlayers = roomPlayers.filter(p => nightState.playersStatus[p.id]?.isAlive);
        const playerActionTitle = actionModal.querySelector('#player-action-section-title');
        const targetsContainer = actionModal.querySelector('#action-modal-targets');
        
        const selectedActionButton = actionModal.querySelector('#action-modal-choices button.selected');
        const possibleActionKeys = currentActorInModal.id === 'wolf_group' 
            ? ['wolf_bite_group', 'curse']
            : currentActorInModal.kind.split('_').map(k => KIND_TO_ACTION_MAP[k]?.key).filter(Boolean);
        
        const actionKey = selectedActionButton ? selectedActionButton.dataset.actionKey : possibleActionKeys[0];
        
        if (!actionKey) {
            targetsContainer.innerHTML = '<p>Hành động không hợp lệ.</p>';
            return;
        }

        const actionConfig = ALL_ACTIONS[actionKey];
        const hasMultipleChoices = actionModal.querySelector('#action-selection-section').style.display === 'block';

        playerActionTitle.textContent = hasMultipleChoices
            ? `Chọn mục tiêu cho "${actionConfig.label}"`
            : 'Chọn mục tiêu';

        targetsContainer.innerHTML = '';
        const currentActions = (nightState.actions || []).filter(a => a.actorId === currentActorInModal.id && a.action === actionKey);
        const currentTargetIds = new Set(currentActions.map(a => a.targetId));

        livingPlayers.forEach(p => {
            const isChecked = currentTargetIds.has(p.id);
            targetsContainer.innerHTML += `
                <div class="target-item">
                    <input type="checkbox" id="modal-target-${p.id}" value="${p.id}" ${isChecked ? 'checked' : ''}>
                    <label for="modal-target-${p.id}">${p.name}</label>
                </div>
            `;
        });

        const limit = currentActorInModal.quantity;
        if (limit !== Infinity) {
            const allCheckboxes = targetsContainer.querySelectorAll('input[type="checkbox"]');
            if (currentTargetIds.size >= limit) {
                allCheckboxes.forEach(cb => {
                    if (!cb.checked) cb.disabled = true;
                });
            }
        }
    }

    function createActionModal() {
        if (document.getElementById('action-modal-overlay')) return;

        actionModal = document.createElement('div');
        actionModal.id = 'action-modal-overlay';
        actionModal.className = 'modal-overlay hidden';
        actionModal.innerHTML = `
            <div class="modal-content action-modal">
                <span class="close-modal-btn">&times;</span>
                <h3 id="action-modal-title">Hành động</h3>
                
                <div class="action-modal-section" id="action-selection-section" style="display: none;">
                    <h4>Chọn hành động</h4>
                    <div id="action-modal-choices" class="gm-override-grid"></div>
                </div>

                <div class="action-modal-section" id="player-action-section">
                    <h4 id="player-action-section-title">Chọn mục tiêu</h4>
                    <div id="action-modal-targets" class="target-grid"></div>
                </div>

                <div class="action-modal-section" id="gm-override-section">
                    <h4>Tác động lên bản thân</h4>
                    <div id="action-modal-gm-overrides" class="gm-override-grid">
                        <button data-override="gm_kill">Bị sát thương</button>
                        <button data-override="gm_save">Được cứu</button>
                        <button data-override="gm_protect">Được bảo vệ</button>
                        <button data-override="gm_add_armor">Được 1 giáp</button>
                        <button data-override="gm_disable_night">Vô hiệu hoá (1 Đêm)</button>
                        <button data-override="gm_disable_perm">Vô hiệu hoá (Vĩnh viễn)</button>
                        <button data-override="change_faction">Chuyển phe</button>
                    </div>
                </div>

                <div class="modal-buttons">
                    <button id="action-modal-confirm" class="btn-primary">Xác Nhận</button>
                </div>
            </div>
        `;
        document.body.appendChild(actionModal);

        actionModal.querySelector('.close-modal-btn').addEventListener('click', () => actionModal.classList.add('hidden'));
        actionModal.addEventListener('click', e => {
            if (e.target === actionModal) actionModal.classList.add('hidden');
        });

        const actionChoicesContainer = actionModal.querySelector('#action-modal-choices');
        actionChoicesContainer.addEventListener('click', e => {
            if (e.target.tagName === 'BUTTON' && currentActorInModal && !e.target.disabled) {
                Array.from(actionChoicesContainer.children).forEach(child => child.classList.remove('selected'));
                e.target.classList.add('selected');
                renderTargetsForSelectedAction(); 
            }
        });

        const targetsContainer = actionModal.querySelector('#action-modal-targets');
        targetsContainer.addEventListener('change', (e) => {
            if (e.target.type !== 'checkbox' || !currentActorInModal) return;

            const limit = currentActorInModal.quantity;
            if (limit === Infinity) return;

            const allCheckboxes = targetsContainer.querySelectorAll('input[type="checkbox"]');
            const checkedCheckboxes = targetsContainer.querySelectorAll('input[type="checkbox"]:checked');

            if (checkedCheckboxes.length >= limit) {
                allCheckboxes.forEach(cb => {
                    if (!cb.checked) {
                        cb.disabled = true;
                    }
                });
            } else {
                allCheckboxes.forEach(cb => {
                    cb.disabled = false;
                });
            }
        });

        actionModal.querySelector('#action-modal-confirm').addEventListener('click', () => {
            if (!currentActorInModal) return;
            const nightState = nightStates[activeNightIndex];
            
            const isWolfActor = currentActorInModal.id === 'wolf_group';
            const possibleKinds = isWolfActor ? ['kill', 'curse'] : currentActorInModal.kind.split('_');
            const possibleActionKeys = possibleKinds.map(k => KIND_TO_ACTION_MAP[k]?.key || k).filter(Boolean);
            
            nightState.actions = nightState.actions.filter(a => 
                !(a.actorId === currentActorInModal.id && possibleActionKeys.includes(a.action) && !a.action.startsWith('gm_'))
            );

            const selectedActionButton = actionModal.querySelector('#action-modal-choices button.selected');
            
            let actionKey = selectedActionButton 
                ? selectedActionButton.dataset.actionKey 
                : null;
            
            if (!actionKey && possibleActionKeys.length > 0) {
                 if (isWolfActor) {
                    actionKey = (currentActorInModal.kind === 'curse') ? 'curse' : 'kill';
                 } else {
                    actionKey = possibleActionKeys[0];
                 }
            }


            if (actionKey) {
                 const checkedTargets = actionModal.querySelectorAll('#action-modal-targets input:checked');
                 checkedTargets.forEach(checkbox => {
                    nightState.actions.push({
                        id: nextActionId++,
                        actorId: currentActorInModal.id,
                        targetId: checkbox.value,
                        action: actionKey
                    });
                });
            }

            saveNightNotes();
            actionModal.classList.add('hidden');
        });

        actionModal.querySelector('#action-modal-gm-overrides').addEventListener('click', e => {
            if (e.target.tagName !== 'BUTTON' || !currentActorInModal) return;
            
            const overrideAction = e.target.dataset.override;
            const nightState = nightStates[activeNightIndex];
            const targetId = currentActorInModal.id;

            if (overrideAction === 'change_faction') {
                openFactionChangeModal(currentActorInModal);
                return;
            }

            if (['gm_kill', 'gm_save', 'gm_protect', 'gm_add_armor'].includes(overrideAction)) {
                const existingActionIndex = nightState.actions.findIndex(a => a.action === overrideAction && a.actorId === targetId && a.targetId === targetId);
                if (existingActionIndex > -1) {
                    nightState.actions.splice(existingActionIndex, 1);
                } else {
                     nightState.actions.push({
                        id: nextActionId++, actorId: targetId, targetId: targetId, action: overrideAction
                    });
                }
            } 
            else if (overrideAction === 'gm_disable_night') {
                const playerStatus = nightState.playersStatus[targetId];
                if (playerStatus) {
                    playerStatus.isDisabled = !playerStatus.isDisabled;
                }
            }
            else if (overrideAction === 'gm_disable_perm') {
                const playerStatus = nightState.playersStatus[targetId];
                if (playerStatus) {
                    playerStatus.isPermanentlyDisabled = !playerStatus.isPermanentlyDisabled;
                }
            }
            
            render();
            saveNightNotes();
        });
    }

    function handleConfirmGroup() {
        const nightState = nightStates[activeNightIndex];
        if (!nightState) return;
    
        const newGroupId = groupNameInput.value.trim().toUpperCase();
        const selectedPlayerIds = new Set(
            Array.from(groupModalPlayers.querySelectorAll('input:checked')).map(cb => cb.value)
        );
    
        const playerBeingEdited = roomPlayers.find(p => p.id === currentGroupEditingPlayerId);
        const originalGroupId = nightState.playersStatus[playerBeingEdited.id]?.groupId;
    
        if (!nightState.damageGroups) {
            nightState.damageGroups = {};
        }
    
        if (originalGroupId && nightState.damageGroups[originalGroupId]) {
            const originalMembers = new Set(nightState.damageGroups[originalGroupId].members);
    
            originalMembers.forEach(memberId => {
                if (!selectedPlayerIds.has(memberId)) {
                    if (nightState.playersStatus[memberId]) {
                        nightState.playersStatus[memberId].groupId = null;
                    }
                }
            });
    
            if (originalGroupId !== newGroupId) {
                 delete nightState.damageGroups[originalGroupId];
            }
        }
    
        if (!newGroupId || selectedPlayerIds.size <= 1) {
            selectedPlayerIds.forEach(pId => {
                if (nightState.playersStatus[pId]) {
                    nightState.playersStatus[pId].groupId = null;
                }
            });
            if (newGroupId && nightState.damageGroups[newGroupId]) {
                delete nightState.damageGroups[newGroupId];
            }
    
        } else {
            nightState.damageGroups[newGroupId] = {
                name: newGroupId,
                members: Array.from(selectedPlayerIds)
            };
            selectedPlayerIds.forEach(pId => {
                if (nightState.playersStatus[pId]) {
                    nightState.playersStatus[pId].groupId = newGroupId;
                }
            });
        }
    
        saveNightNotes();
        groupModal.classList.add('hidden');
    }
    
    function openActionModal(actor) {
        currentActorInModal = actor;
        
        const actionModalTitle = actionModal.querySelector('#action-modal-title');
        const actionSelectionSection = actionModal.querySelector('#action-selection-section');
        const actionChoicesContainer = actionModal.querySelector('#action-modal-choices');
        const playerActionSection = actionModal.querySelector('#player-action-section');
        const gmOverrideSection = actionModal.querySelector('#gm-override-section');
        
        actionModalTitle.textContent = `Hành động: ${actor.name} (${actor.roleName})`;
        
        const isWolfGroup = actor.id === 'wolf_group';
        const possibleKinds = isWolfGroup ? [actor.kind] : actor.kind.split('_');
        const allPossibleActions = possibleKinds.map(k => KIND_TO_ACTION_MAP[k] || { key: 'wolf_bite_group', label: 'Sói cắn' }).filter(Boolean);

        actionChoicesContainer.innerHTML = '';

        const currentlyAvailableActions = allPossibleActions.filter(action => {
            return isWolfGroup || isActionCurrentlyAvailable(actor, action.key, activeNightIndex);
        });

        if (allPossibleActions.length > 1) {
            actionSelectionSection.style.display = 'block';
            allPossibleActions.forEach(action => {
                const btn = document.createElement('button');
                btn.textContent = action.label;
                btn.dataset.actionKey = action.key;
                if (action.type) btn.classList.add(`action-type-${action.type}`);

                const isAvailable = currentlyAvailableActions.some(a => a.key === action.key);

                if (!isAvailable) {
                    btn.disabled = true;
                    btn.title = "Không có sẵn hoặc đã sử dụng";
                }

                if (isAvailable && !actionChoicesContainer.querySelector('.selected')) {
                    btn.classList.add('selected');
                }
                
                actionChoicesContainer.appendChild(btn);
            });
        } else {
            actionSelectionSection.style.display = 'none';
        }

        if (currentlyAvailableActions.length > 0) {
            playerActionSection.style.display = 'block';
            renderTargetsForSelectedAction();
        } else {
            playerActionSection.style.display = 'none';
        }
        
        gmOverrideSection.style.display = isWolfGroup ? 'none' : 'block';
        
        actionModal.classList.remove('hidden');
    }

    function createFactionChangeModal() {
        if (document.getElementById('faction-change-modal-overlay')) return;
        const modal = document.createElement('div');
        modal.id = 'faction-change-modal-overlay';
        modal.className = 'modal-overlay hidden';
        
        let buttonsHTML = SELECTABLE_FACTIONS.map(faction => 
            `<button class="faction-change-btn" data-faction="${faction}">${faction}</button>`
        ).join('');
    
        modal.innerHTML = `
            <div class="modal-content faction-change-modal">
                <span class="close-modal-btn">&times;</span>
                <h4 id="faction-change-title">Chọn phe mới</h4>
                <div class="faction-change-options">${buttonsHTML}</div>
            </div>
        `;
        document.body.appendChild(modal);
        factionChangeModal = modal;
    
        const closeModal = () => factionChangeModal.classList.add('hidden');
        factionChangeModal.querySelector('.close-modal-btn').addEventListener('click', closeModal);
        factionChangeModal.addEventListener('click', e => {
            if (e.target === factionChangeModal) {
                closeModal();
            }
            if (e.target.matches('.faction-change-btn')) {
                const newFaction = e.target.dataset.faction;
                const nightState = nightStates[activeNightIndex];
                const targetId = currentActorInModal.id;
    
                if (!Array.isArray(nightState.factionChanges)) {
                    nightState.factionChanges = [];
                }
                nightState.factionChanges = nightState.factionChanges.filter(c => c.playerId !== targetId);
                nightState.factionChanges.push({ playerId: targetId, newFaction: newFaction });
                
                const playerInClient = roomPlayers.find(p => p.id === targetId);
                if(playerInClient) playerInClient.faction = newFaction;

                saveNightNotes();
                render();
                closeModal();
                if (actionModal) actionModal.classList.add('hidden');
            }
        });
    }

    function openFactionChangeModal(actor) {
        currentActorInModal = actor;
        factionChangeModal.querySelector('#faction-change-title').textContent = `Chuyển phe cho ${actor.name}`;
        factionChangeModal.classList.remove('hidden');
    }
    
    function recalculateAllPlayerFactions() {
        const basePlayers = roomPlayers.map(p => ({...p, faction: p.baseFaction}));
        const finalFactions = {};
        basePlayers.forEach(p => finalFactions[p.id] = p.baseFaction);

        for(let i = 0; i < activeNightIndex; i++) {
            const night = nightStates[i];
            if (Array.isArray(night.factionChanges)) {
                night.factionChanges.forEach(change => {
                    finalFactions[change.playerId] = change.newFaction;
                });
            }
        }
        
        roomPlayers.forEach(p => {
            p.faction = finalFactions[p.id] || p.baseFaction;
        });
    }

    const initialize = async (_roomId) => {
        roomId = _roomId;
        roomIdDisplay.textContent = roomId;
        await fetchAllRolesData();
        const roomRef = database.ref(`rooms/${roomId}`);
        
        roomRef.on('value', (snapshot) => {
            const roomData = snapshot.val();
            if(!roomData) return;

            const playersData = roomData.players || {};
            nightStates = roomData.nightNotes || [];
            customPlayerOrder = roomData.playerOrder || [];

            const basePlayers = Object.keys(playersData).map(key => {
                const originalData = playersData[key];
                const roleName = (originalData.roleName || '').trim();
                const roleInfo = allRolesData[roleName] || { faction: 'Chưa phân loại', active: '0', kind: 'empty', quantity: 1 };
                
                return { 
                    id: key, 
                    ...originalData,
                    baseFaction: roleInfo.faction, 
                    faction: roleInfo.faction, 
                    activeRule: roleInfo.active,
                    kind: roleInfo.kind,
                    quantity: roleInfo.quantity
                };
            });
            
            const finalFactions = {};
            basePlayers.forEach(p => finalFactions[p.id] = p.baseFaction);

            nightStates.forEach(night => {
                if (Array.isArray(night.factionChanges)) {
                    night.factionChanges.forEach(change => {
                        finalFactions[change.playerId] = change.newFaction;
                    });
                }
            });

            roomPlayers = basePlayers.map(p => ({
                ...p,
                faction: finalFactions[p.id] || p.baseFaction
            }));

            if (!customPlayerOrder || customPlayerOrder.length !== roomPlayers.length) {
                customPlayerOrder = roomPlayers.map(p => p.id);
            }

            if (roomPlayers.length > 0 && nightStates.length === 0) {
                 const initialStatus = Object.fromEntries(roomPlayers.map(p => {
                    return [p.id, { 
                        isAlive: p.isAlive, 
                        isDisabled: false,
                        isPermanentlyDisabled: false,
                        armor: (p.kind === 'armor1') ? 2 : 1,
                        delayKillAvailable: (p.kind === 'delaykill'),
                        isDoomed: false,
                        deathLinkTarget: null,
                        sacrificedBy: null,
                        transformedTo: null,
                        groupId: null,
                        markedForDelayKill: false
                    }];
                 }));
                 nightStates.push({
                    actions: [],
                    playersStatus: initialStatus,
                    initialPlayersStatus: JSON.parse(JSON.stringify(initialStatus)),
                    isFinished: false,
                    gmNote: "",
                    damageGroups: {},
                    factionChanges: []
                });
                activeNightIndex = 0;
                saveNightNotes();
            } else if (nightStates.length > 0) {
                nextActionId = Math.max(0, ...nightStates.flatMap(n => (n.actions || [])).map(a => a.id || 0)) + 1;
            }

            render();
        });

        document.removeEventListener('click', handleEvents); 
        document.addEventListener('click', handleEvents);
        
        gmNoteBtn.addEventListener('click', () => {
             if (nightStates[activeNightIndex]) {
                nightStates[activeNightIndex].gmNote = gmNoteArea.value;
                saveNightNotes();
                gmNoteBtn.textContent = "Đã lưu!";
                setTimeout(()=> gmNoteBtn.textContent = "Lưu Ghi Chú", 1500);
            }
        });
        
        createActionModal();
        createFactionChangeModal();
        createGroupModal();
    };

    const urlRoomId = new URLSearchParams(window.location.search).get('roomId');
    if (urlRoomId) {
        initialize(urlRoomId);
    } else {
        document.body.innerHTML = '<h1>Lỗi: Không tìm thấy ID phòng trong URL.</h1>';
    }

    function createGroupModal(){
        groupModal = document.getElementById('group-modal-overlay');
        if (!groupModal) return;
        groupModalTitle = document.getElementById('group-modal-title');
        groupNameInput = document.getElementById('group-name-input');
        groupModalPlayers = document.getElementById('group-modal-players');
        groupModalConfirmBtn = document.getElementById('group-modal-confirm');
        const closeModal = () => groupModal.classList.add('hidden');
        groupModal.querySelector('.close-modal-btn').addEventListener('click', closeModal);
        groupModal.addEventListener('click', (e) => {
            if (e.target === groupModal) closeModal();
        });
        groupModalConfirmBtn.addEventListener('click', handleConfirmGroup);
    }
    function openGroupModal(playerId){
        currentGroupEditingPlayerId = playerId;
        const nightState = nightStates[activeNightIndex];
        const playerState = nightState.playersStatus[playerId];
        const player = roomPlayers.find(p => p.id === playerId);
        groupModalTitle.textContent = `Thiết lập nhóm cho ${player.name}`;
        const currentGroupId = playerState.groupId;
        const currentGroup = (currentGroupId && nightState.damageGroups) ? nightState.damageGroups[currentGroupId] : null;
        groupNameInput.value = currentGroupId || '';
        groupModalPlayers.innerHTML = '';
        const livingPlayers = roomPlayers.filter(p => nightState.playersStatus[p.id]?.isAlive);
        livingPlayers.forEach(p => {
            let isChecked = false;
            if (currentGroup && currentGroup.members.includes(p.id)) {
                isChecked = true;
            } else if (!currentGroup && p.id === playerId) {
                isChecked = true;
            }
            groupModalPlayers.innerHTML += `
                <div class="target-item">
                    <input type="checkbox" id="modal-group-target-${p.id}" value="${p.id}" ${isChecked ? 'checked' : ''}>
                    <label for="modal-group-target-${p.id}">${p.name}</label>
                </div>
            `;
        });
        groupModal.classList.remove('hidden');
    }
});