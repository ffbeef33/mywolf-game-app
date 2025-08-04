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
    let gmNoteArea, gmNoteBtn;
    let nightActionSummaryDiv;

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
    };

    let ALL_ACTIONS = {};

    // --- State ---
    let roomPlayers = [], allRolesData = {}, nightStates = [], activeNightIndex = 0, nextActionId = 0, roomId = null;

    // --- Data Fetching ---
    const fetchAllRolesData = async () => {
        try {
            const response = await fetch(`/api/sheets?sheetName=Roles`);
            if (!response.ok) throw new Error('Không thể tải dữ liệu vai trò.');
            const rawData = await response.json();
            
            allRolesData = rawData.reduce((acc, role) => {
                const roleName = (role.RoleName || '').trim();
                if (roleName) {
                    acc[roleName] = {
                        faction: (role.Faction || 'Chưa phân loại').trim(),
                        active: (role.Active || '0').trim(),
                        kind: (role.Kind || 'empty').trim(),
                        quantity: parseInt(role.Quantity, 10) || 1
                    };
                }
                return acc;
            }, {});

            ALL_ACTIONS = Object.values(KIND_TO_ACTION_MAP).reduce((acc, action) => {
                acc[action.key] = action;
                return acc;
            }, {});
            ALL_ACTIONS['wolf_bite_group'] = { label: 'Sói cắn', type: 'damage' };

        } catch (error) {
            console.error("Lỗi tải dữ liệu vai trò:", error);
            interactionTable.innerHTML = `<p style="color:red;">Lỗi: Không thể tải dữ liệu vai trò từ Google Sheet.</p>`;
        }
    };

    function saveNightNotes() {
        if (roomId) database.ref(`rooms/${roomId}/nightNotes`).set(nightStates);
    }
    
    function isActionAvailable(player, currentNightIndex) {
        const rule = player.activeRule;
        const nightNumber = currentNightIndex + 1;

        if (!rule || rule === '0' || player.kind === 'empty') {
            return false;
        }

        const parts = rule.split('_');
        const uses = parts[0];
        const startNight = parts.length > 1 ? parseInt(parts[1], 10) : 1;

        if (nightNumber < startNight) {
            return false;
        }

        if (uses === '1') {
            let timesUsed = 0;
            for (let i = 0; i < nightStates.length; i++) {
                if (nightStates[i] && nightStates[i].actions) {
                    for (const action of nightStates[i].actions) {
                        if (action.actorId === player.id && action.action !== 'wolf_bite_group') {
                            timesUsed++;
                        }
                    }
                }
            }
            if (timesUsed > 0) {
                return false;
            }
        }
        
        return true;
    }

    function getSortPriority(player) {
        const isActive = player.activeRule !== '0';
        const isSaver = player.kind.includes('save');
        const isWitch = player.roleName === 'Phù thuỷ';

        if (!isActive) return 4;
        if (isWitch) return 3;
        if (isSaver) return 2;
        return 1;
    }

    // --- Logic ---
    const calculateNightStatus = (nightState) => {
        if (!nightState) return { liveStatuses: {}, finalStatus: {}, deadPlayerNames: [], infoResults: [] };
        
        const actions = nightState.actions || [];
        const initialStatus = nightState.playersStatus;
        const finalStatus = JSON.parse(JSON.stringify(initialStatus));
        const liveStatuses = {}; 
        const infoResults = [];

        // --- Giai đoạn 0: Khởi tạo ---
        Object.keys(initialStatus).forEach(pId => {
            if (initialStatus[pId].isAlive) {
                liveStatuses[pId] = {
                    damage: 0, isProtected: false, isSaved: false,
                    isDisabled: initialStatus[pId].isDisabled || false,
                    armor: initialStatus[pId].armor || 1,
                    isDoomed: initialStatus[pId].isDoomed || false,
                    delayKillAvailable: initialStatus[pId].delayKillAvailable !== false,
                    deathLinkTarget: initialStatus[pId].deathLinkTarget || null,
                    gatheredBy: null,
                    markedForDelayKill: initialStatus[pId].markedForDelayKill || false,
                    tempStatus: {
                        hasKillAbility: false,
                    }
                };
                if (liveStatuses[pId].isDoomed) {
                    liveStatuses[pId].damage = 99;
                }
                if (liveStatuses[pId].markedForDelayKill) {
                    liveStatuses[pId].damage = 99;
                }
            }
        });

        // --- Giai đoạn 1: Các hiệu ứng thay đổi luồng & phòng thủ ưu tiên ---
        const damageRedirects = {}; 
        const counterWards = {};    
        const counterShieldedTargets = new Set();

        Object.keys(initialStatus).forEach(pId => {
            if(initialStatus[pId].sacrificedBy) {
                damageRedirects[pId] = initialStatus[pId].sacrificedBy;
            }
        });
        
        actions.forEach(({ actorId, targetId, action }) => {
            const actor = roomPlayers.find(p => p.id === actorId);
            if (!actor || liveStatuses[actorId]?.isDisabled) return;
            const actionKind = ALL_ACTIONS[action]?.key || action;
            if (actionKind === 'countershield') {
                counterShieldedTargets.add(targetId);
            }
        });

        actions.forEach(({ actorId, targetId, action }) => {
            const actor = roomPlayers.find(p => p.id === actorId);
            if (!actor || liveStatuses[actorId]?.isDisabled) return;
            const target = roomPlayers.find(p => p.id === targetId);
            const targetStatus = liveStatuses[targetId];
            
            const actionKind = ALL_ACTIONS[action]?.key || action;

            if (actionKind === 'disable_action') { if(targetStatus) targetStatus.isDisabled = true; }
            else if (actionKind === 'protect') {
                if(targetStatus && !counterShieldedTargets.has(targetId)) {
                    targetStatus.isProtected = true;
                }
            }
            else if (actionKind === 'sacrifice') { damageRedirects[targetId] = actorId; }
            else if (actionKind === 'checkcounter') { counterWards[targetId] = { actorId: actorId, triggered: false }; }
            else if (actionKind === 'checkdmg') {
                if (liveStatuses[actorId]) liveStatuses[actorId].deathLinkTarget = targetId;
            }
            else if (actionKind === 'givekill') {
                if (targetStatus) targetStatus.tempStatus.hasKillAbility = true;
            }
            else if (actionKind === 'givearmor') {
                if (targetStatus) targetStatus.armor = 2;
                const actorStatus = liveStatuses[actorId];
                if (actorStatus) actorStatus.armor = 2;
                damageRedirects[targetId] = actorId;
            }
            else if (actionKind === 'choosesacrifier') {
                if (finalStatus[actorId]) {
                    finalStatus[actorId].sacrificedBy = targetId;
                    damageRedirects[actorId] = targetId;
                    infoResults.push(`- ${actor.roleName} (${actor.name}) đã chọn ${target.name} làm người thế mạng.`);
                }
            }
            else if (actionKind === 'collect') {
                if (finalStatus[targetId]) {
                    finalStatus[targetId].faction = actor.faction;
                    infoResults.push(`- ${actor.roleName} (${actor.name}) đã cải đạo ${target.name} sang ${actor.faction}.`);
                }
            }
            else if (actionKind === 'transform') {
                if (finalStatus[actorId]) {
                    if (target) {
                        finalStatus[actorId].transformedTo = target.roleName;
                        infoResults.push(`- ${actor.roleName} (${actor.name}) đã biến thành ${target.roleName}.`);
                    }
                }
            }
            else if (actionKind === 'killdelay') {
                if (finalStatus[targetId]) {
                    finalStatus[targetId].markedForDelayKill = true;
                    infoResults.push(`- ${actor.roleName} (${actor.name}) đã nguyền rủa ${target.name}.`);
                }
            }
            else if (actionKind === 'gather') {
                if (targetStatus) {
                    targetStatus.gatheredBy = actorId;
                }
            }
        });
        
        // --- Giai đoạn 2: Tấn công, Phản đòn & Kiểm tra ---
        actions.forEach(({ actorId, targetId, action }) => {
            const attacker = roomPlayers.find(p => p.id === actorId);
            const target = roomPlayers.find(p => p.id === targetId);
            const actionKind = ALL_ACTIONS[action]?.key || action;

            if (actorId === 'wolf_group') {
                const finalTargetId = damageRedirects[targetId] || targetId;
                const targetStatus = liveStatuses[finalTargetId];
                if (targetStatus) targetStatus.damage++;
                return;
            }
            if (!attacker || !target || liveStatuses[actorId]?.isDisabled) return;
            
            const attackerHasKill = actionKind.includes('kill') || liveStatuses[actorId]?.tempStatus.hasKillAbility;

            if (attackerHasKill && actionKind !== 'killdelay') {
                const finalTargetId = damageRedirects[targetId] || targetId;
                const finalTarget = roomPlayers.find(p => p.id === finalTargetId);
                const finalTargetStatus = liveStatuses[finalTargetId];
                
                if (!finalTarget || !finalTargetStatus) return;
                
                let shouldDamage = true;
                if(actionKind === 'killwolf' && !(finalTarget.faction === 'Bầy Sói' || finalTarget.faction === 'Phe Sói')){
                    shouldDamage = false;
                }
                if(actionKind === 'killvillager'){
                    if(finalTarget.faction === 'Phe Dân') {
                        shouldDamage = true;
                    } else {
                        shouldDamage = false;
                        if (liveStatuses[actorId]) liveStatuses[actorId].damage++;
                    }
                }
                
                if(shouldDamage) finalTargetStatus.damage++;
                
                if (finalTarget.kind === 'counter') {
                    if (liveStatuses[actorId]) liveStatuses[actorId].damage++;
                }
                if (finalTargetId !== targetId) {
                     if (liveStatuses[actorId]) liveStatuses[actorId].damage++;
                }
                const ward = counterWards[finalTargetId];
                if (ward && !ward.triggered) {
                    if (liveStatuses[actorId]) liveStatuses[actorId].damage++;
                    ward.triggered = true;
                }
            }
            
            if (actionKind === 'audit') {
                let isWolf = (target.faction === 'Bầy Sói' || target.faction === 'Phe Sói');
                if (target.kind === 'reverse' || target.kind === 'counteraudit') {
                    isWolf = !isWolf;
                }
                const result = isWolf ? "thuộc Phe Sói" : "KHÔNG thuộc Phe Sói";
                infoResults.push(`- ${attacker.roleName} (${attacker.name}) soi ${target.name}: ${result}.`);
            }
            if (actionKind === 'invest') {
                const result = (target.faction !== 'Phe Dân') ? "KHÔNG thuộc Phe Dân" : "thuộc Phe Dân";
                infoResults.push(`- ${attacker.roleName} (${attacker.name}) điều tra ${target.name}: ${result}.`);
            }
            if (actionKind === 'check') {
                const targetAction = actions.find(a => a.actorId === targetId);
                if (targetAction) {
                    const finalTargetOfTarget = roomPlayers.find(p => p.id === targetAction.targetId);
                    infoResults.push(`- ${attacker.roleName} (${attacker.name}) thấy ${target.name} đã chọn ${finalTargetOfTarget?.name || 'Không rõ'}.`);
                } else {
                    infoResults.push(`- ${attacker.roleName} (${attacker.name}) thấy ${target.name} không chọn ai cả.`);
                }
            }
        });
        
        const gatherGroups = {};
        Object.keys(liveStatuses).forEach(pId => {
            const status = liveStatuses[pId];
            if(status.gatheredBy) {
                if(!gatherGroups[status.gatheredBy]) {
                    gatherGroups[status.gatheredBy] = [];
                }
                gatherGroups[status.gatheredBy].push(pId);
            }
        });
        
        Object.values(gatherGroups).forEach(group => {
            let totalDamage = 0;
            group.forEach(pId => {
                totalDamage += liveStatuses[pId].damage;
            });
            group.forEach(pId => {
                liveStatuses[pId].damage = totalDamage;
            });
        });


        // --- Giai đoạn 3: Cứu ---
        actions.forEach(({ actorId, targetId, action }) => {
             const actor = roomPlayers.find(p => p.id === actorId);
             if (!actor || liveStatuses[actorId]?.isDisabled) return;
             
             const actionKind = ALL_ACTIONS[action]?.key || action;
             if (actionKind.includes('save')) {
                 const targetStatus = liveStatuses[targetId];
                 if (targetStatus) {
                    if (actor.kind === 'save_gather' && targetStatus.gatheredBy) {
                        const groupToSave = gatherGroups[targetStatus.gatheredBy];
                        if (groupToSave) {
                            groupToSave.forEach(pId => {
                                liveStatuses[pId].isSaved = true;
                            });
                        }
                    } else {
                        targetStatus.isSaved = true;
                    }
                 }
             }
        });

        // --- Giai đoạn 4: Tổng kết kết quả ---
        let deadPlayerIdsThisNight = new Set();
        Object.keys(liveStatuses).forEach(pId => {
            const status = liveStatuses[pId];
            const player = roomPlayers.find(p => p.id === pId);
            
            if (!player) {
                console.warn(`Không tìm thấy người chơi với ID ${pId} trong danh sách.`);
                return;
            }
            
            let effectiveDamage = status.damage;
            
            if (status.isProtected) { effectiveDamage = 0; }
            if (effectiveDamage > 0 && status.armor > 1) {
                const damageAbsorbed = Math.min(effectiveDamage, status.armor - 1);
                status.armor -= damageAbsorbed;
                effectiveDamage -= damageAbsorbed;
            }
            
            if (effectiveDamage > 0 && !status.isSaved) {
                status.isDead = true;
            } else {
                status.isDead = false;
            }

            if (status.isDead) {
                if (player.kind === 'delaykill' && status.delayKillAvailable) {
                    finalStatus[pId].isDoomed = true;
                    finalStatus[pId].delayKillAvailable = false;
                } else {
                    finalStatus[pId].isAlive = false;
                    deadPlayerIdsThisNight.add(pId);
                }
            }

            if (finalStatus[pId]) {
                finalStatus[pId].armor = status.armor;
                if (liveStatuses[pId].deathLinkTarget) {
                    finalStatus[pId].deathLinkTarget = liveStatuses[pId].deathLinkTarget;
                }
            }
        });
        
        let chainReactionOccurred = true;
        while(chainReactionOccurred) {
            chainReactionOccurred = false;
            const newlyDead = [];
            roomPlayers.forEach(player => {
                if (deadPlayerIdsThisNight.has(player.id) && finalStatus[player.id]?.deathLinkTarget) {
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

    function buildNightActionSummary(nightState) {
        if (!nightState || !Array.isArray(nightState.actions)) return "<em>Chưa có hành động nào trong đêm này.</em>";
        let result = "";

        const wolfBiteActions = nightState.actions.filter(a => a.action === 'wolf_bite_group');
        if (wolfBiteActions.length) {
            const targets = wolfBiteActions.map(a => {
                const p = roomPlayers.find(x => x.id === a.targetId);
                return p ? `${p.name}${p.roleName ? " ("+p.roleName+")" : ""}` : "???";
            });
            result += `<div class="night-action-summary-item"><strong style="color:#f85149;">Bầy Sói</strong> chọn cắn: ${targets.join(', ')}</div>`;
        }

        nightState.actions.filter(a => a.action !== 'wolf_bite_group').forEach(({ action, targetId, actorId }) => {
            const actor = roomPlayers.find(p => p.id === actorId);
            const target = roomPlayers.find(p => p.id === targetId);
            let actorName = actor ? actor.name : "???";
            let actorRole = actor && actor.roleName ? actor.roleName : "";
            let targetName = target ? target.name : "???";
            let targetRole = target && target.roleName ? target.roleName : "";
            let text = `${actorName}${actorRole ? " ("+actorRole+")" : ""} chọn ${ALL_ACTIONS[action]?.label || action} ${targetName}${targetRole ? " ("+targetRole+")" : ""}`;
            result += `<div class="night-action-summary-item">${text}</div>`;
        });

        if (Array.isArray(nightState.factionChanges)) {
            nightState.factionChanges.forEach(change => {
                const player = roomPlayers.find(p => p.id === change.playerId);
                const name = player ? player.name : "???";
                const role = player ? (player.roleName || "") : "";
                result += `<div class="night-action-summary-item"><span style="color:#d29922;"><strong>${name}${role ? " ("+role+")" : ""}</strong> chuyển sang phe <strong>${change.newFaction}</strong></span></div>`;
            });
        }

        return result || "<em>Chưa có hành động nào trong đêm này.</em>";
    }

    // --- Rendering ---
    const render = () => {
        interactionTable.innerHTML = '';
        const nightState = nightStates[activeNightIndex];
        if (!nightState) {
            interactionTable.innerHTML = '<div class="loading-spinner"></div>';
            return;
        }
        const { liveStatuses, infoResults, deadPlayerNames } = calculateNightStatus(nightState);

        FACTION_GROUPS.forEach(group => {
            const groupPlayers = roomPlayers.filter(p => group.factions.includes(p.faction));
            if (groupPlayers.length === 0) return;
            
            const wrapper = document.createElement('div');
            wrapper.className = `faction-group-wrapper ${group.className || ''}`;

            const header = document.createElement('div');
            header.className = `faction-header ${group.className || ''}`;
            header.textContent = group.display;
            wrapper.appendChild(header);

            if (group.factions.includes('Bầy Sói')) {
                const wolfRow = document.createElement('div');
                wolfRow.className = 'player-row wolf-bite-group-row';
                wolfRow.innerHTML = `
                    <div class="player-header">
                        <div class="player-info"><div class="player-name">Hành Động Chung (Bầy Sói)</div></div>
                        <div class="wolf-bite-controls" style="margin-top:10px;">
                            <label style="font-weight:600; color:var(--danger-color); margin-right:8px;">Sói cắn:</label>
                            <select multiple class="wolf-bite-target-select" style="min-width:120px; background:#21262c; color:#c9d1d9; border-radius:7px;">
                                ${roomPlayers.filter(p => nightState.playersStatus[p.id]?.isAlive)
                                    .map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                            </select>
                            <button class="wolf-bite-group-btn btn-danger" style="margin-left:12px;">Thêm hành động</button>
                        </div>
                    </div>
                    <div class="action-list wolf-bite-group-list"></div>
                `;
                const wolfActionListDiv = wolfRow.querySelector('.wolf-bite-group-list');
                if (nightStates[activeNightIndex] && Array.isArray(nightStates[activeNightIndex].actions)) {
                    nightStates[activeNightIndex].actions.forEach(action => {
                        if (action.action === 'wolf_bite_group') {
                            const target = roomPlayers.find(p => p.id === action.targetId);
                            wolfActionListDiv.innerHTML += `<div class="action-item" data-action-id="${action.id}"><i class="fas fa-arrow-right"></i><span class="action-type-damage">Sói cắn</span><span class="target-name">${target?.name || 'Không rõ'}</span><button class="remove-action-btn" title="Xóa">&times;</button></div>`;
                        }
                    });
                }
                wrapper.appendChild(wolfRow);
            }
            
            groupPlayers.sort((a, b) => {
                const priorityA = getSortPriority(a);
                const priorityB = getSortPriority(b);
                if (priorityA !== priorityB) {
                    return priorityA - priorityB;
                }
                return a.name.localeCompare(b.name);
            }).forEach(player => {
                const playerState = nightState.playersStatus[player.id];
                const lStatus = liveStatuses ? liveStatuses[player.id] : null;
                if (playerState) {
                    wrapper.appendChild(createPlayerRow(player, playerState, lStatus, nightState.isFinished));
                }
            });

            interactionTable.appendChild(wrapper);
        });

        renderNightTabs();
        
        if (deadPlayerNames.length > 0) {
            nightResultsDiv.innerHTML = `<strong>Dự kiến chết:</strong> ${deadPlayerNames.map(name => `<span class="dead-player">${name}</span>`).join(', ')}`;
        } else {
             nightResultsDiv.innerHTML = '<p>Không có ai chết trong đêm nay.</p>';
        }
        if (nightState.isFinished) {
            nightResultsDiv.innerHTML = deadPlayerNames.length > 0
                    ? `<strong>Đã chết:</strong> ${deadPlayerNames.map(name => `<span class="dead-player">${name}</span>`).join(', ')}`
                    : '<p>Không có ai chết trong đêm nay.</p>';
        }

        let gmInfoLogDiv = document.getElementById('gm-info-log');
        if (!gmInfoLogDiv) {
            gmInfoLogDiv = document.createElement('div');
            gmInfoLogDiv.id = 'gm-info-log';
            gmInfoLogDiv.className = 'card';
            nightResultsDiv.parentNode.insertBefore(gmInfoLogDiv, nightResultsDiv.nextSibling);
        }
        
        if (infoResults && infoResults.length > 0) {
            gmInfoLogDiv.style.display = 'block';
            gmInfoLogDiv.innerHTML = `<h4>Kết quả kiểm tra đêm nay:</h4><ul>${infoResults.map(res => `<li>${res}</li>`).join('')}</ul>`;
        } else {
            gmInfoLogDiv.style.display = 'none';
        }

        if (!nightActionSummaryDiv) {
            nightActionSummaryDiv = document.createElement('div');
            nightActionSummaryDiv.id = "night-action-summary";
            nightResultsDiv.parentNode.insertBefore(nightActionSummaryDiv, gmInfoLogDiv.nextSibling);
        }
        nightActionSummaryDiv.style.display = "block";
        nightActionSummaryDiv.innerHTML = `<div style="font-weight:700; color:#58a6ff; margin-bottom:8px;">Tất cả hành động trong đêm:</div>${buildNightActionSummary(nightState)}`;

        if (!gmNoteArea) {
            gmNoteArea = document.createElement('textarea');
            gmNoteArea.id = "gm-night-note";
            gmNoteArea.rows = 2;
            gmNoteArea.placeholder = "Ghi chú của quản trò cho đêm này...";
            nightResultsDiv.parentNode.insertBefore(gmNoteArea, nightActionSummaryDiv.nextSibling);
        }
        if (!gmNoteBtn) {
            gmNoteBtn = document.createElement('button');
            gmNoteBtn.id = "save-gm-night-note-btn";
            gmNoteBtn.textContent = "Lưu ghi chú đêm";
            gmNoteBtn.className = "btn-end-night";
            gmNoteBtn.onclick = function() {
                nightStates[activeNightIndex].gmNote = gmNoteArea.value;
                saveNightNotes();
                gmNoteBtn.textContent = "Đã lưu!";
                setTimeout(()=>gmNoteBtn.textContent="Lưu ghi chú đêm",1000);
            }
        }
        gmNoteArea.style.display = "block";
        gmNoteBtn.style.display = "inline-block";
        gmNoteArea.value = nightState.gmNote || "";

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
                    render();
                }
            });
        }
    };

    function createPlayerRow(player, playerState, liveStatus, isFinished) {
        const row = document.createElement('div');
        row.className = 'player-row';
        row.dataset.playerId = player.id;

        if (!playerState.isAlive) {
            row.classList.add('status-dead');
        } else if (liveStatus) {
            if (liveStatus.isProtected) row.classList.add('status-protected');
            if (liveStatus.isSaved && !liveStatus.isProtected) row.classList.add('status-saved'); 
            if (liveStatus.isDead && !liveStatus.isSaved && !liveStatus.isProtected) row.classList.add('status-danger');
            // <<< SỬA ĐỔI: Thêm hiển thị cho người bị disable bởi Kind >>>
            if (liveStatus.isDisabled && !playerState.isDisabled) {
                row.classList.add('status-disabled-by-ability');
            }
        }
        
        if (playerState.isDisabled) row.classList.add('status-disabled');

        const factionSelectHTML = `<select class="player-faction-select" style="display:none;">${SELECTABLE_FACTIONS.map(f => `<option value="${f}"${player.faction===f?' selected':''}>${f}</option>`).join('')}</select>`;
        const changeFactionBtnHTML = `<button class="change-faction-btn">Chuyển phe</button>`;

        let optionsHTML = '';
        if (isActionAvailable(player, activeNightIndex)) {
            const kinds = player.kind.split('_');
            optionsHTML += `<optgroup label="Hành động ${player.roleName}">`;
            kinds.forEach(k => {
                const actionInfo = KIND_TO_ACTION_MAP[k];
                if (actionInfo) {
                    optionsHTML += `<option value="${actionInfo.key}">${actionInfo.label}</option>`;
                }
            });
            optionsHTML += `</optgroup>`;
        }
        
        const showActionControls = playerState.isAlive && !isFinished && !playerState.isDisabled && optionsHTML.trim() !== '';
        
        const nightState = nightStates[activeNightIndex];
        const currentActions = nightState ? (nightState.actions || []).filter(a => a.actorId === player.id) : [];
        const currentTargetNames = currentActions.map(action => {
            const target = roomPlayers.find(p => p.id === action.targetId);
            return target ? target.name : '';
        }).filter(name => name).join(', ');

        const actionControlsHTML = `
            <div class="action-controls">
                <select class="action-select"><option value="">-- Chọn hành động --</option>${optionsHTML}</select>
                <button class="open-target-modal-btn">Chọn mục tiêu</button>
                <span class="selected-targets">${currentTargetNames ? `Đã chọn: ${currentTargetNames}`: ''}</span>
            </div>`;

        let actionListHTML = buildActionList(player.id, nightStates[activeNightIndex]);
        
        let statusIconsHTML = '<div class="status-icons">';
        if (liveStatus) {
            if (liveStatus.isProtected) {
                statusIconsHTML += '<i class="fas fa-shield-alt icon-protected" title="Được bảo vệ"></i>';
            }
            if (liveStatus.isSaved) {
                statusIconsHTML += '<i class="fas fa-heart icon-saved" title="Được cứu"></i>';
            }
            if (liveStatus.isDead && !liveStatus.isSaved && !liveStatus.isProtected) {
                statusIconsHTML += '<i class="fas fa-skull-crossbones icon-danger" title="Dự kiến chết"></i>';
            }
            // <<< SỬA ĐỔI: Thêm icon cho người bị disable bởi Kind >>>
            if (liveStatus.isDisabled && !playerState.isDisabled) {
                statusIconsHTML += '<i class="fas fa-user-slash icon-disabled-by-ability" title="Bị vô hiệu hóa"></i>';
            }
        }
        statusIconsHTML += '</div>';

        row.innerHTML = `
            <div class="player-header">
                <div class="player-info">
                    <div class="player-name">${player.name}</div>
                    <div class="player-role">${player.roleName || 'Chưa có vai'} <span style="font-style:italic; opacity:0.8;">(${player.faction})</span></div>
                    <div>${changeFactionBtnHTML}${factionSelectHTML}</div>
                </div>
                ${statusIconsHTML}
                <div class="player-status-controls">
                    <button class="status-btn life ${playerState.isAlive ? 'alive' : 'dead'}" title="Sống/Chết"><i class="fas fa-heart"></i></button>
                    <button class="status-btn disable ${playerState.isDisabled ? 'disabled' : 'enabled'}" title="${playerState.isDisabled ? 'Bật lại chức năng' : 'Vô hiệu hóa'}"><i class="fas fa-user-slash"></i></button>
                    ${playerState.isDisabled ? '<span class="disable-label">VÔ HIỆU</span>' : ''}
                </div>
                ${showActionControls ? actionControlsHTML : ''}
            </div>
            <div class="action-list">${actionListHTML}</div>
        `;
        
        setTimeout(() => {
            const changeFactionBtn = row.querySelector('.change-faction-btn');
            const factionSelect = row.querySelector('.player-faction-select');
            
            if (changeFactionBtn) {
                changeFactionBtn.onclick = function() {
                    factionSelect.style.display = 'inline-block';
                    changeFactionBtn.style.display = 'none';
                    factionSelect.focus();
                };
            }
            
            if (factionSelect) {
                const handleFactionChange = function() {
                    const oldFaction = player.faction;
                    const newFaction = factionSelect.value;
                    const playerToUpdate = roomPlayers.find(p => p.id === player.id);
                    if(playerToUpdate) playerToUpdate.faction = newFaction;
                    if (!Array.isArray(nightStates[activeNightIndex].factionChanges)) {
                        nightStates[activeNightIndex].factionChanges = [];
                    }
                    nightStates[activeNightIndex].factionChanges.push({ playerId: player.id, oldFaction, newFaction });
                    saveNightNotes();
                    render();
                };
                factionSelect.onchange = handleFactionChange;
                factionSelect.onblur = function() { 
                    factionSelect.style.display = 'none';
                    changeFactionBtn.style.display = 'inline-block';
                };
            }

            row.querySelectorAll('.remove-action-btn').forEach(btn => {
                btn.onclick = function(e) {
                    const actionId = parseInt(btn.closest('.action-item').dataset.actionId, 10);
                    const nightState = nightStates[activeNightIndex];
                    const actionIndex = nightState.actions.findIndex(a => a.id === actionId);
                    if (actionIndex > -1) {
                        nightState.actions.splice(actionIndex, 1);
                        saveNightNotes();
                        render();
                    }
                    e.preventDefault();
                    e.stopPropagation();
                }
            });

            if (showActionControls && nightState && Array.isArray(nightState.actions)) {
                const actionsTakenThisTurn = nightState.actions.filter(a => a.actorId === player.id).length;
                const quantityLimit = player.quantity || 1;

                if (actionsTakenThisTurn >= quantityLimit) {
                    const openModalBtn = row.querySelector('.open-target-modal-btn');
                    if(openModalBtn) openModalBtn.disabled = true;
                }
            }

        }, 10);
        
        return row;
    }
    
    function buildActionList(playerId, nightState) {
        let html = '';
        if (nightState && Array.isArray(nightState.actions)) {
            nightState.actions.forEach(action => {
                if (action.actorId === playerId) {
                    const target = roomPlayers.find(p => p.id === action.targetId);
                    const actionConfig = ALL_ACTIONS[action.action];
                    const actionLabel = actionConfig?.label || action.action;
                    const actionType = actionConfig?.type || 'custom';
                    html += `
                        <div class="action-item" data-action-id="${action.id}">
                            <i class="fas fa-arrow-right"></i>
                            <span class="action-type-${actionType}">${actionLabel}</span>
                            <span class="target-name">${target?.name || 'Không rõ'}</span>
                            <button class="remove-action-btn" title="Xóa">&times;</button>
                        </div>`;
                }
            });
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
    };

    const handleEvents = (e) => {
        const target = e.target;
        const nightState = nightStates[activeNightIndex];

        if (target.closest('#add-night-btn')) {
            const lastNight = nightStates[nightStates.length - 1];
            if (lastNight && !lastNight.isFinished) {
                alert(`Vui lòng kết thúc Đêm ${nightStates.length} trước khi thêm đêm mới.`);
                return;
            }
            const prevStatus = lastNight ? calculateNightStatus(lastNight).finalStatus : Object.fromEntries(roomPlayers.map(p => {
                const player = roomPlayers.find(rp => rp.id === p.id);
                return [p.id, { 
                    isAlive: true, 
                    isDisabled: false, 
                    armor: (player?.kind === 'armor1' ? 2 : 1),
                    delayKillAvailable: (player?.kind === 'delaykill'),
                    isDoomed: false,
                    deathLinkTarget: null,
                    sacrificedBy: null,
                    transformedTo: null,
                    markedForDelayKill: false
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
                gmNote: ""
            });
            activeNightIndex = nightStates.length - 1;
            saveNightNotes();
            render();
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
        else if (target.closest('.open-target-modal-btn')) {
            const row = target.closest('.player-row');
            const actorId = row.dataset.playerId;
            const actor = roomPlayers.find(p => p.id === actorId);
            const actionKey = row.querySelector('.action-select').value;

            if (!actionKey) {
                alert('Vui lòng chọn một hành động trước.');
                return;
            }

            openTargetModal(actor, actionKey);
        }
        else if (target.closest('.wolf-bite-group-btn')) {
            const wolfRow = target.closest('.wolf-bite-group-row');
            const select = wolfRow.querySelector('.wolf-bite-target-select');
            const selectedIds = Array.from(select.selectedOptions).map(opt => opt.value);
            if (selectedIds.length === 0) return;

            selectedIds.forEach(targetId => {
                nightState.actions.push({
                    id: nextActionId++,
                    actorId: 'wolf_group',
                    action: 'wolf_bite_group',
                    targetId: targetId
                });
            });
            saveNightNotes();
            render();
        }
        else if (target.closest('.wolf-bite-group-list .remove-action-btn')) {
            const actionId = parseInt(target.closest('.action-item').dataset.actionId, 10);
            const actionIndex = nightState.actions.findIndex(a => a.id === actionId);
            if (actionIndex > -1) {
                nightState.actions.splice(actionIndex, 1);
                saveNightNotes();
                render();
            }
        }
        else if (target.closest('#reset-night-btn')) {
            if (confirm(`Bạn có chắc muốn làm mới mọi hành động và trạng thái Sống/Chết trong Đêm ${activeNightIndex + 1}?`)) {
                nightState.actions = [];
                nightState.isFinished = false;
                nightState.playersStatus = JSON.parse(JSON.stringify(nightState.initialPlayersStatus));
                saveNightNotes();
                render();
            }
        } else if (target.closest('#end-night-btn')) {
            if (!nightState.isFinished && confirm(`Bạn có chắc muốn kết thúc Đêm ${activeNightIndex + 1}?`)) {
                nightState.isFinished = true;
                saveNightNotes();
                render();
            }
        } else {
            const row = target.closest('.player-row');
            if (row && !nightState.isFinished) {
                const actorId = row.dataset.playerId;
                if (target.closest('.status-btn.life')) {
                    nightState.playersStatus[actorId].isAlive = !nightState.playersStatus[actorId].isAlive;
                    saveNightNotes();
                    render();
                } else if (target.closest('.status-btn.disable')) {
                    nightState.playersStatus[actorId].isDisabled = !nightState.playersStatus[actorId].isDisabled;
                    saveNightNotes();
                    render();
                }
            }
        }
    };

    function createTargetModal() {
        if (document.getElementById('target-modal-overlay')) return;

        const modalOverlay = document.createElement('div');
        modalOverlay.id = 'target-modal-overlay';
        modalOverlay.className = 'modal-overlay hidden';

        modalOverlay.innerHTML = `
            <div class="modal-content">
                <span id="close-target-modal-btn" class="close-modal-btn">&times;</span>
                <h3 id="target-modal-title">Chọn mục tiêu</h3>
                <p id="target-modal-limit"></p>
                <div id="target-modal-list" class="target-list"></div>
                <div class="modal-buttons">
                    <button id="confirm-targets-btn" class="btn-end-night">Xác nhận</button>
                </div>
            </div>
        `;
        document.body.appendChild(modalOverlay);

        const closeModal = () => modalOverlay.classList.add('hidden');
        modalOverlay.onclick = (e) => { if (e.target === modalOverlay) closeModal(); };
        document.getElementById('close-target-modal-btn').onclick = closeModal;
    }

    function openTargetModal(actor, actionKey) {
        const modalOverlay = document.getElementById('target-modal-overlay');
        const modalList = document.getElementById('target-modal-list');
        const modalTitle = document.getElementById('target-modal-title');
        const modalLimit = document.getElementById('target-modal-limit');
        const confirmBtn = document.getElementById('confirm-targets-btn');

        const quantityLimit = actor.quantity || 1;
        modalTitle.textContent = `Chọn mục tiêu cho ${actor.roleName} (${actor.name})`;
        modalLimit.textContent = `(Chọn tối đa: ${quantityLimit})`;

        const nightState = nightStates[activeNightIndex];
        const livingPlayers = roomPlayers.filter(p => nightState?.playersStatus[p.id]?.isAlive);
        const currentTargetIds = new Set(
            (nightState?.actions || [])
                .filter(a => a.actorId === actor.id && a.action === actionKey)
                .map(a => a.targetId)
        );

        modalList.innerHTML = '';
        livingPlayers.forEach(player => {
            const isChecked = currentTargetIds.has(player.id);
            const item = document.createElement('div');
            item.className = 'target-item';
            item.innerHTML = `
                <input type="checkbox" id="target-${player.id}" value="${player.id}" ${isChecked ? 'checked' : ''}>
                <label for="target-${player.id}">${player.name}</label>
            `;
            modalList.appendChild(item);
        });
        
        modalList.onchange = () => {
            const checkedCount = modalList.querySelectorAll('input:checked').length;
            if (checkedCount >= quantityLimit) {
                modalList.querySelectorAll('input:not(:checked)').forEach(cb => cb.disabled = true);
            } else {
                modalList.querySelectorAll('input:not(:checked)').forEach(cb => cb.disabled = false);
            }
        };
        modalList.onchange();

        confirmBtn.onclick = () => {
            const selectedIds = Array.from(modalList.querySelectorAll('input:checked')).map(cb => cb.value);
            
            let actions = nightState.actions || [];
            actions = actions.filter(a => !(a.actorId === actor.id && a.action === actionKey));

            selectedIds.forEach(targetId => {
                actions.push({ id: nextActionId++, actorId: actor.id, action: actionKey, targetId });
            });
            nightState.actions = actions;

            saveNightNotes();
            render();
            modalOverlay.classList.add('hidden');
        };

        modalOverlay.classList.remove('hidden');
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
            
            roomPlayers = Object.keys(playersData).map(key => {
                const originalData = playersData[key];
                const roleName = (originalData.roleName || '').trim();
                const roleInfo = allRolesData[roleName] || { faction: 'Chưa phân loại', active: '0', kind: 'empty', quantity: 1 };
                
                return { 
                    id: key, 
                    ...originalData, 
                    faction: roleInfo.faction,
                    activeRule: roleInfo.active,
                    kind: roleInfo.kind,
                    quantity: roleInfo.quantity
                };
            });

            const notes = roomData.nightNotes;
            if (notes && Array.isArray(notes)) {
                nightStates = notes;
                nextActionId = Math.max(0, ...notes.flatMap(n => n.actions || []).map(a => a.id)) + 1;
            } else if (roomPlayers.length > 0 && nightStates.length === 0) {
                 const initialStatus = Object.fromEntries(roomPlayers.map(p => {
                    const player = roomPlayers.find(rp => rp.id === p.id);
                    return [p.id, { 
                        isAlive: p.isAlive, 
                        isDisabled: false,
                        armor: (player?.kind === 'armor1') ? 2 : 1,
                        delayKillAvailable: (player?.kind === 'delaykill'),
                        isDoomed: false,
                        deathLinkTarget: null,
                        sacrificedBy: null,
                        transformedTo: null
                    }];
                 }));
                 nightStates.push({
                    actions: [],
                    playersStatus: initialStatus,
                    initialPlayersStatus: JSON.parse(JSON.stringify(initialStatus)),
                    isFinished: false,
                    gmNote: ""
                });
                activeNightIndex = 0;
                saveNightNotes();
            }

            roomPlayers.forEach(player => {
                nightStates.forEach(night => {
                    if (night.playersStatus && !night.playersStatus[player.id]) {
                        night.playersStatus[player.id] = {
                            isAlive: player.isAlive,
                            isDisabled: false,
                            armor: (player.kind === 'armor1') ? 2 : 1,
                            delayKillAvailable: (player.kind === 'delaykill'),
                            isDoomed: false,
                            deathLinkTarget: null,
                            sacrificedBy: null,
                            transformedTo: null
                        };
                    }
                });
            });

            render();
        });

        document.addEventListener('click', handleEvents);
        createTargetModal();
    };

    const urlRoomId = new URLSearchParams(window.location.search).get('roomId');
    if (urlRoomId) {
        initialize(urlRoomId);
    } else {
        document.body.innerHTML = '<h1>Lỗi: Không tìm thấy ID phòng trong URL.</h1>';
    }
});