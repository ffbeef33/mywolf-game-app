// =================================================================
// === game-logic.js - Bộ não xử lý logic đêm dùng chung ===
// =================================================================

// Các hằng số định nghĩa hành động, được chuyển từ night-note.js
const KIND_TO_ACTION_MAP = {
    'shield': { key: 'protect', label: 'Bảo vệ', type: 'defense' },
    'save': { key: 'save', label: 'Cứu', type: 'defense' },
    'kill': { key: 'kill', label: 'Giết', type: 'damage' },
    'disable': { key: 'disable_action', label: 'Vô hiệu hóa', type: 'debuff' },
    'freeze': { key: 'freeze', label: 'Đóng băng', type: 'debuff' },
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
    'curse': { key: 'curse', label: 'Nguyền', type: 'buff' },
    'boom': { key: 'boom', label: 'Cài Boom', type: 'debuff' },
    'love': { key: 'love', label: 'Yêu', type: 'conditional' },
    'saveall': { key: 'saveall', label: 'Cứu Hết', type: 'defense' },
};

const ALL_ACTIONS = Object.values(KIND_TO_ACTION_MAP).reduce((acc, action) => {
    acc[action.key] = action;
    return acc;
}, {});
ALL_ACTIONS['wolf_bite_group'] = { label: 'Sói cắn', type: 'damage', key: 'kill' };
ALL_ACTIONS['gm_kill'] = { label: 'Bị sát thương (GM)', type: 'damage' };
ALL_ACTIONS['gm_protect'] = { label: 'Được bảo vệ (GM)', type: 'defense' };
ALL_ACTIONS['gm_save'] = { label: 'Được cứu (GM)', type: 'defense' };
ALL_ACTIONS['gm_add_armor'] = { label: 'Được 1 giáp (GM)', type: 'buff' };
ALL_ACTIONS['gm_disable_night'] = { label: 'Bị vô hiệu hoá (1 Đêm)', type: 'debuff' };
ALL_ACTIONS['gm_disable_perm'] = { label: 'Bị vô hiệu hoá (Vĩnh viễn)', type: 'debuff' };


/**
 * Hàm tính toán kết quả đêm, được chuyển nguyên bản từ night-note.js
 * @param {object} nightState - Trạng thái của đêm cần tính toán.
 * @param {Array} roomPlayers - Danh sách tất cả người chơi trong phòng.
 * @returns {object} - Kết quả đêm bao gồm { finalStatus, deadPlayerNames, infoResults, ... }
 */
function calculateNightStatus(nightState, roomPlayers) {
    if (!nightState) return { liveStatuses: {}, finalStatus: {}, deadPlayerNames: [], infoResults: [], loveRedirects: {} };
        
    let actions = nightState.actions || [];
    const initialStatus = nightState.playersStatus;
    const finalStatus = JSON.parse(JSON.stringify(initialStatus));
    const liveStatuses = {}; 
    const infoResults = [];

    if (Array.isArray(nightState.factionChanges)) {
        nightState.factionChanges.forEach(change => {
            if (change.isImmediate && finalStatus[change.playerId]) {
                finalStatus[change.playerId].faction = change.newFaction;
            }
        });
    }

    Object.keys(initialStatus).forEach(pId => {
        if (initialStatus[pId] && initialStatus[pId].isAlive) {
            liveStatuses[pId] = {
                damage: 0, 
                isProtected: initialStatus[pId].isPermanentlyProtected || false,
                isSaved: false,
                isDisabled: initialStatus[pId].isDisabled || initialStatus[pId].isPermanentlyDisabled || false,
                armor: initialStatus[pId].armor || 1,
                isDoomed: initialStatus[pId].isDoomed || false,
                delayKillAvailable: initialStatus[pId].delayKillAvailable !== false,
                deathLinkTarget: initialStatus[pId].deathLinkTarget || null,
                gatheredBy: null,
                markedForDelayKill: initialStatus[pId].markedForDelayKill || false,
                tempStatus: { 
                    hasKillAbility: initialStatus[pId].hasPermanentKillAbility || false
                },
                isSavedByKillif: false,
                isNotified: initialStatus[pId].isPermanentlyNotified || false,
                groupId: initialStatus[pId].groupId || null,
                isBoobyTrapped: initialStatus[pId].isBoobyTrapped || false,
                isImmuneToWolves: false,
            };
            if (liveStatuses[pId].isDoomed) liveStatuses[pId].damage = 99;
            if (liveStatuses[pId].markedForDelayKill) liveStatuses[pId].damage = 99;
        }
    });

    const damageRedirects = {}; 
    const counterWards = {};    
    const counterShieldedTargets = new Set();
    const damageLinks = {};
    const loveRedirects = {};

    Object.keys(initialStatus).forEach(pId => {
        if(initialStatus[pId] && initialStatus[pId].sacrificedBy) {
            damageRedirects[pId] = initialStatus[pId].sacrificedBy;
        }
    });
    
    const disabledByAbilityPlayerIds = new Set();
    actions.forEach(({ actorId, targetId, action }) => {
        const actorLiveStatus = liveStatuses[actorId];
        if (actorLiveStatus && !actorLiveStatus.isDisabled) {
            const actionKind = ALL_ACTIONS[action]?.key || action;
            if (actionKind === 'love' || actionKind === 'disable_action' || actionKind === 'freeze') {
                disabledByAbilityPlayerIds.add(targetId);
            }
        }
    });

    disabledByAbilityPlayerIds.forEach(pId => {
        if (liveStatuses[pId]) {
            liveStatuses[pId].isDisabled = true;
        }
    });

    actions.forEach(({ actorId, targetId, action }) => {
        const actor = roomPlayers.find(p => p.id === actorId);
        const isWolfAction = actorId === 'wolf_group';

        if (!isWolfAction && actor && liveStatuses[actorId] && liveStatuses[actorId].isDisabled) {
            const actionKindCheck = ALL_ACTIONS[action]?.key || action;
            if (actionKindCheck !== 'love' && actionKindCheck !== 'disable_action' && actionKindCheck !== 'freeze') {
                return;
            }
        }
        
        if (!isWolfAction && !actor) return;
        
        const target = roomPlayers.find(p => p.id === targetId);
        const targetStatus = liveStatuses[targetId];
        if (!target || !targetStatus) return;
        
        const actionKind = ALL_ACTIONS[action]?.key || action;
        const duration = actor ? (actor.duration || '1') : '1';

        if (actionKind === 'countershield') {
            counterShieldedTargets.add(targetId);
        }
        else if (actionKind === 'disable_action') {
            if (duration === 'n') {
                finalStatus[targetId].isPermanentlyDisabled = true;
            }
        }
        else if (actionKind === 'freeze') {
            if (!counterShieldedTargets.has(targetId)) {
                targetStatus.isProtected = true;
            }
        }
        else if (actionKind === 'gm_add_armor') targetStatus.armor++;
        else if (actionKind === 'protect' || actionKind === 'gm_protect') {
             if(!counterShieldedTargets.has(targetId)) targetStatus.isProtected = true;
             if (duration === 'n') {
                finalStatus[targetId].isPermanentlyProtected = true;
            }
        }
        else if (actionKind === 'sacrifice') {
             damageRedirects[targetId] = actorId;
             if (duration === 'n') {
                finalStatus[actorId].sacrificedBy = targetId;
            }
        }
        else if (actionKind === 'checkcounter') {
            counterWards[targetId] = { actorId: actorId, triggered: false };
            if (duration === 'n') {
                finalStatus[targetId].hasPermanentCounterWard = true;
            }
        }
        else if (actionKind === 'checkdmg') {
            if (liveStatuses[actorId]) {
                liveStatuses[actorId].deathLinkTarget = targetId;
                if (duration === 'n') {
                    finalStatus[actorId].deathLinkTarget = targetId;
                }
            }
        }
        else if (actionKind === 'givekill') {
            targetStatus.tempStatus.hasKillAbility = true;
            if (duration === 'n') {
                finalStatus[targetId].hasPermanentKillAbility = true;
            }
        }
        else if (actionKind === 'givearmor') {
            targetStatus.armor = 2;
            if (liveStatuses[actorId]) liveStatuses[actorId].armor = 2;
            damageRedirects[targetId] = actorId;
        }
        else if (actionKind === 'choosesacrifier') {
            if (finalStatus[actorId]) {
                finalStatus[actorId].sacrificedBy = targetId;
                damageRedirects[actorId] = targetId;
                infoResults.push(`- ${actor.roleName} (${actor.name}) đã chọn ${target.name} làm người thế mạng.`);
            }
        }
        else if (actionKind === 'transform') {
            if (finalStatus[actorId]) {
                const newRoleData = allRolesData[target.roleName];
                if (newRoleData) {
                    finalStatus[actorId].transformedState = {
                        roleName: target.roleName,
                        kind: newRoleData.kind,
                        activeRule: newRoleData.active,
                        quantity: newRoleData.quantity,
                        duration: newRoleData.duration
                    };
                    infoResults.push(`- ${actor.roleName} (${actor.name}) sẽ biến thành ${target.roleName} vào đêm mai.`);
                }
            }
        }
        else if (actionKind === 'killdelay') {
            if (finalStatus[targetId]) {
                finalStatus[targetId].markedForDelayKill = true;
                infoResults.push(`- ${actor.roleName} (${actor.name}) đã nguyền rủa ${target.name}.`);
            }
        }
        else if (actionKind === 'gather') targetStatus.gatheredBy = actorId;
        else if (actionKind === 'noti') {
            targetStatus.isNotified = true;
            if (duration === 'n') {
                finalStatus[targetId].isPermanentlyNotified = true;
            }
        }
         else if (actionKind === 'boom') {
            if(finalStatus[targetId]) finalStatus[targetId].isBoobyTrapped = true;
        }
        else if (actionKind === 'love') {
            if (liveStatuses[actorId]) liveStatuses[actorId].isImmuneToWolves = true;
            loveRedirects[targetId] = actorId;

            if(target.faction === 'Bầy Sói') {
                if (liveStatuses[actorId]) liveStatuses[actorId].damage++;
                infoResults.push(`- ${actor.name} đã chết vì yêu nhầm Sói (${target.name}).`);
            }
        }
    });
    
    const disabledPlayerIds = new Set();
    Object.keys(liveStatuses).forEach(pId => {
        if (liveStatuses[pId].isDisabled) {
            disabledPlayerIds.add(pId);
        }
    });

    const executableActions = actions.filter(action => {
        const actionKind = ALL_ACTIONS[action.action]?.key || action.action;
        const isSelfDisablingAction = actionKind === 'love' || actionKind === 'disable_action' || actionKind === 'freeze';
        return !disabledPlayerIds.has(action.actorId) || isSelfDisablingAction;
    });
    
    const killifActions = executableActions.filter(({ action }) => (ALL_ACTIONS[action]?.key || action) === 'killif');
    const otherActions = executableActions.filter(({ action }) => !['killif', 'curse', 'collect', 'transform', 'love'].includes(ALL_ACTIONS[action]?.key || action));

    otherActions.forEach(({ actorId, targetId, action }) => {
        const attacker = roomPlayers.find(p => p.id === actorId);
        let finalTargetId = targetId;

        const isWolfBite = (action === 'kill' && actorId === 'wolf_group');
        const isWolfCurse = (action === 'curse' && actorId === 'wolf_group');

        if (loveRedirects[targetId] && (isWolfBite || isWolfCurse)) {
            const loverId = loveRedirects[targetId];
            const loverStatus = liveStatuses[loverId];
            const originalTarget = roomPlayers.find(p => p.id === targetId);
            const newTarget = roomPlayers.find(p => p.id === loverId);
            const actionName = isWolfBite ? 'Sói cắn' : 'Nguyền';
            infoResults.push(`- ${newTarget.name} đã nhận thay ${actionName} cho ${originalTarget.name}.`);
            
            if (isWolfBite && loverStatus && !loverStatus.isProtected) {
                loverStatus.damage++;
            }
            
            return; 
        }
        
        const target = roomPlayers.find(p => p.id === finalTargetId);
        const actionKind = ALL_ACTIONS[action]?.key || action;

        if (action === 'kill' || actionKind === 'gm_kill') {
            const ultimateTargetId = damageRedirects[finalTargetId] || finalTargetId;
            const targetStatus = liveStatuses[ultimateTargetId];
            if (targetStatus && !targetStatus.isProtected && !targetStatus.isImmuneToWolves) {
                targetStatus.damage++;
                if (targetStatus.isBoobyTrapped) {
                    const originalAttacker = (actorId === 'wolf_group') ? {id: 'wolf_group', name: 'Bầy Sói'} : attacker;
                    if (originalAttacker.id === 'wolf_group') {
                        const livingWolves = roomPlayers.filter(p => (p.faction === 'Bầy Sói' || p.faction === 'Phe Sói') && finalStatus[p.id]?.isAlive);
                        if (livingWolves.length > 0) {
                            const randomWolf = livingWolves[Math.floor(Math.random() * livingWolves.length)];
                            if (liveStatuses[randomWolf.id] && !liveStatuses[randomWolf.id].isProtected) {
                                liveStatuses[randomWolf.id].damage++;
                                infoResults.push(`- Sói ${randomWolf.name} đã chết do boom khi cắn ${target.name}.`);
                            }
                        }
                    } else if (liveStatuses[originalAttacker.id] && !liveStatuses[originalAttacker.id].isProtected) {
                        liveStatuses[originalAttacker.id].damage++;
                        infoResults.push(`- ${originalAttacker.name} bị nổ boom khi tấn công ${target.name}.`);
                    }
                    targetStatus.isBoobyTrapped = false;
                    finalStatus[ultimateTargetId].isBoobyTrapped = false;
                }
            }
            return;
        }

        if (!attacker || !target) return;
        
        const attackerHasKill = actionKind.includes('kill') || (liveStatuses[actorId] && liveStatuses[actorId].tempStatus.hasKillAbility);

        if (attackerHasKill && actionKind !== 'killdelay') {
            const ultimateTargetId = damageRedirects[finalTargetId] || finalTargetId;
            const finalTarget = roomPlayers.find(p => p.id === ultimateTargetId);
            const finalTargetStatus = liveStatuses[ultimateTargetId];
            
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
            
            if(shouldDamage) {
                finalTargetStatus.damage++;
                if (finalTargetStatus.isBoobyTrapped) {
                     if (liveStatuses[attacker.id] && !liveStatuses[attacker.id].isProtected) {
                        liveStatuses[attacker.id].damage++;
                        infoResults.push(`- ${attacker.name} bị nổ boom khi tấn công ${finalTarget.name}.`);
                    }
                    finalTargetStatus.isBoobyTrapped = false;
                    finalStatus[ultimateTargetId].isBoobyTrapped = false;
                }
            }
            
            if (finalTarget.kind === 'counter' && !liveStatuses[attacker.id].isProtected) {
                if (liveStatuses[attacker.id]) liveStatuses[attacker.id].damage++;
            }
            if (ultimateTargetId !== finalTargetId && !liveStatuses[attacker.id].isProtected) {
                 if (liveStatuses[attacker.id]) liveStatuses[attacker.id].damage++;
            }
            const ward = counterWards[ultimateTargetId];
            if ((ward || finalStatus[ultimateTargetId]?.hasPermanentCounterWard) && (!ward || !ward.triggered) && !liveStatuses[attacker.id].isProtected) {
                if (liveStatuses[attacker.id]) liveStatuses[attacker.id].damage++;
                if (ward) ward.triggered = true;
            }
        }
        
        if (actionKind === 'audit') {
            const currentFaction = finalStatus[targetId]?.faction || target.faction;
            let isBaySoi = (currentFaction === 'Bầy Sói');
            if (target.kind.includes('reverse') || target.kind.includes('counteraudit')) isBaySoi = !isBaySoi;
            const result = isBaySoi ? "thuộc Bầy Sói" : "KHÔNG thuộc Bầy Sói";
            infoResults.push(`- ${attacker.roleName} (${attacker.name}) soi ${target.name}: ${result}.`);
        }
        if (actionKind === 'invest') {
            const currentFaction = finalStatus[targetId]?.faction || target.faction;
            const isAnyWolf = (currentFaction === 'Bầy Sói' || currentFaction === 'Phe Sói');
            const result = isAnyWolf ? "thuộc Phe Sói" : "KHÔNG thuộc Phe Sói";
            infoResults.push(`- ${attacker.roleName} (${attacker.name}) điều tra ${target.name}: ${result}.`);
        }
        if (actionKind === 'check') {
            infoResults.push(`- ${attacker.roleName} (${attacker.name}) đã kiểm tra ${target.name}.`);
        }
    });

    killifActions.forEach(({ actorId, targetId }) => {
        const attacker = roomPlayers.find(p => p.id === actorId);
        const target = roomPlayers.find(p => p.id === targetId);
        if (!attacker || !target) return;
        
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

    executableActions.forEach(({ actorId, targetId, action }) => {
         const actor = roomPlayers.find(p => p.id === actorId);
         if (!actor) return;
         
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

    const saveAllAction = executableActions.find(a => (ALL_ACTIONS[a.action]?.key || a.action) === 'saveall');
    const didSaveAll = saveAllAction && saveAllAction.targetId === saveAllAction.actorId;

    if (didSaveAll) {
        infoResults.push(`- ${roomPlayers.find(p=>p.id===saveAllAction.actorId).name} đã cứu tất cả mọi người!`);
    }

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
        
        if (finalDamage > 0 && !res.isSaved && !didSaveAll) {
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
    
    return { liveStatuses, finalStatus, deadPlayerNames, infoResults, loveRedirects };
}