// =================================================================
// === game-logic.js - Cập nhật cho 2 chế độ & Sửa lỗi Shieldhouse ===
// =================================================================

const KIND_TO_ACTION_MAP = {
    'shield': { key: 'protect', label: 'Bảo vệ', type: 'defense' },
    'save': { key: 'save', label: 'Cứu', type: 'defense' },
    'kill': { key: 'kill', label: 'Giết', type: 'damage' },
    'disable': { key: 'disable_action', label: 'Vô hiệu hóa', type: 'debuff' },
    'freeze': { key: 'freeze', label: 'Đóng băng', type: 'debuff' },
    'check': { key: 'check', label: 'Kiểm tra', type: 'info' },
    'audit': { key: 'audit', label: 'Soi phe Sói', type: 'info' },
    'invest': { key: 'invest', label: 'Điều tra', type: 'info' },
    'detect': { key: 'detect', label: 'Điều tra xác chết', type: 'info' },
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
    'wizard': { key: 'wizard_save', label: 'Cứu Thế', type: 'conditional' },
    'wizard_kill': { key: 'wizard_kill', label: 'Giết', type: 'damage' },
    'assassin': { key: 'assassinate', label: 'Ám sát', type: 'conditional' },
    // [NHÀ SÓI] Thêm các Kind mới
    'shieldhouse': { key: 'shieldhouse', label: 'Bảo vệ Nhà', type: 'defense' },
    'killwolfhouse': { key: 'killwolfhouse', label: 'Săn Sói Rời Nhà', type: 'damage' },
    'keeperhouse': { key: 'keeperhouse', label: 'Giữ Nhà', type: 'debuff' },
    'trapperhouse': { key: 'trapperhouse', label: 'Bẫy Nhà', type: 'damage' },
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
 * Tính toán kết quả của một đêm dựa trên hành động của người chơi.
 * @param {object} nightState Trạng thái của đêm (hành động, trạng thái người chơi).
 * @param {Array<object>} roomPlayers Danh sách tất cả người chơi trong phòng.
 * @param {string} gameMode Chế độ chơi ('classic' hoặc 'wolf_house').
 * @returns {object} Kết quả cuối cùng của đêm.
 */
function calculateNightStatus(nightState, roomPlayers, gameMode = 'classic') {
    if (!nightState) return { liveStatuses: {}, finalStatus: {}, deadPlayerNames: [], infoResults: [], loveRedirects: {}, wizardSavedPlayerNames: [] };
        
    let actions = nightState.actions || [];
    const initialStatus = nightState.playersStatus;
    // Tạo bản sao sâu để tránh thay đổi trạng thái ban đầu
    const finalStatus = JSON.parse(JSON.stringify(initialStatus));
    const liveStatuses = {}; 
    const infoResults = [];
    
    // Áp dụng thay đổi phe ngay lập tức nếu có
    if (Array.isArray(nightState.factionChanges)) {
        nightState.factionChanges.forEach(change => {
            if (change.isImmediate && finalStatus[change.playerId]) {
                finalStatus[change.playerId].faction = change.newFaction;
            }
        });
    }

    // Khởi tạo trạng thái "sống" cho mỗi người chơi còn sống
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
                killedByWolfBite: false,
            };
            if (liveStatuses[pId].isDoomed) liveStatuses[pId].damage = 99;
            if (liveStatuses[pId].markedForDelayKill) liveStatuses[pId].damage = 99;
        }
    });

    const damageRedirects = {}; 
    const loveRedirects = {};

    Object.keys(initialStatus).forEach(pId => {
        if(initialStatus[pId] && initialStatus[pId].sacrificedBy) {
            damageRedirects[pId] = initialStatus[pId].sacrificedBy;
        }
    });

    // =================================================================
    // === LOGIC CHO CHẾ ĐỘ "NHÀ CỦA SÓI" (WOLF HOUSE) ================
    // =================================================================
    if (gameMode === 'wolf_house') {
        const playerLocations = nightState.playerLocations || {};

        // BƯỚC 1: XÁC ĐỊNH VỊ TRÍ CUỐI CÙNG CỦA MỌI NGƯỜI
        const finalHouseOccupants = {};
        const livingPlayerIds = roomPlayers.filter(p => initialStatus[p.id]?.isAlive).map(p => p.id);
        livingPlayerIds.forEach(pId => { finalHouseOccupants[pId] = new Set(); });

        livingPlayerIds.forEach(pId => {
            const destinationHouseId = playerLocations[pId];
            if (destinationHouseId && livingPlayerIds.includes(destinationHouseId)) {
                finalHouseOccupants[destinationHouseId].add(pId); // Đến nhà người khác
            } else {
                finalHouseOccupants[pId].add(pId); // Ở nhà mình
            }
        });

        // BƯỚC 2: XỬ LÝ ƯU TIÊN CÁC HÀNH ĐỘNG PHÒNG THỦ NHÀ (FIX LỖI SHIELDHOUSE)
        const shieldHouseActions = actions.filter(a => a.action === 'shieldhouse');
        shieldHouseActions.forEach(({ targets }) => {
            (targets || []).forEach(targetHouseId => {
                const occupants = finalHouseOccupants[targetHouseId] || new Set();
                occupants.forEach(occupantId => {
                    if (liveStatuses[occupantId]) {
                        liveStatuses[occupantId].isProtected = true;
                    }
                });
            });
        });

        // BƯỚC 3: XỬ LÝ CÁC HÀNH ĐỘNG VÔ HIỆU HÓA (KEEPER)
        const keeperActions = actions.filter(a => a.action === 'keeperhouse');
        const trappedHouses = new Set(keeperActions.flatMap(a => a.targets));
        
        // Lọc và vô hiệu hóa các hành động của người bị giữ và Sói tấn công
        let executableActions = actions.filter(action => {
            const actor = roomPlayers.find(p => p.id === action.actorId);
            if (!actor) return true; // Giữ lại các action hệ thống

            // Vô hiệu hóa Sói cắn nếu nhà Sói tấn công bị giữ
            if (action.originalActor === 'wolf_group' && action.action === 'kill') {
                const attackingWolfHouseId = action.actorId; // actorId là Sói đi cắn
                if (trappedHouses.has(attackingWolfHouseId)) {
                    infoResults.push(`- Bầy Sói không thể tấn công vì nhà của Sói ${actor.name} đã bị giữ.`);
                    return false; // Loại bỏ hành động cắn
                }
            }
            // Vô hiệu hóa hành động của người chơi bị giữ nếu vai trò của họ yêu cầu rời nhà
            const actorHouseId = actor.id;
            const roleRequiresLeaving = actor.house === '1'; // Dữ liệu từ Google Sheet
            if (trappedHouses.has(actorHouseId) && roleRequiresLeaving) {
                infoResults.push(`- ${actor.name} không thể thực hiện chức năng vì bị giữ trong nhà.`);
                return false;
            }
            return true;
        });

        // BƯỚC 4: XỬ LÝ CÁC HÀNH ĐỘNG CÒN LẠI
        executableActions.forEach(({ actorId, targets, action, originalActor }) => {
            (targets || []).forEach(targetId => {
                // SÓI CẮN (NHÀ)
                if (originalActor === 'wolf_group' && action === 'kill') {
                    const targetHouseId = targetId;
                    const occupants = finalHouseOccupants[targetHouseId] || new Set();
                    occupants.forEach(occupantId => {
                        const occupantStatus = liveStatuses[occupantId];
                        if (occupantStatus && !occupantStatus.isProtected) {
                            occupantStatus.damage++;
                            occupantStatus.killedByWolfBite = true;
                        }
                    });
                    return;
                }
                
                // SĂN SÓI RỜI NHÀ
                if (action === 'killwolfhouse') {
                    if (playerLocations[targetId]) { // Kiểm tra xem mục tiêu có rời nhà không
                        const targetStatus = liveStatuses[targetId];
                        if(targetStatus && !targetStatus.isProtected) {
                            targetStatus.damage++;
                        }
                    }
                    return;
                }

                // BẪY NHÀ
                if (action === 'trapperhouse') {
                    const targetHouseId = targetId;
                    const occupants = finalHouseOccupants[targetHouseId] || new Set();
                    occupants.forEach(occupantId => {
                        if (occupantId !== targetHouseId) { // Bẫy không tác dụng lên chủ nhà
                            const visitorStatus = liveStatuses[occupantId];
                            if (visitorStatus && !visitorStatus.isProtected) {
                                visitorStatus.damage++;
                            }
                        }
                    });
                    return;
                }
                // (Các hành động cá nhân khác nếu có sẽ được xử lý ở logic chung bên dưới)
            });
        });
        
        // (Phần logic chung cho các hành động không liên quan đến nhà sẽ chạy sau)
        actions = executableActions; // Cập nhật lại danh sách hành động sau khi đã lọc
    }

    // =================================================================
    // === LOGIC CHUNG CHO CẢ 2 CHẾ ĐỘ ================================
    // =================================================================
    
    // Xử lý các hiệu ứng vô hiệu hóa trước
    const disabledByAbilityPlayerIds = new Set();
    actions.forEach(({ actorId, targets, action }) => {
        (targets || []).forEach(targetId => {
            const actorLiveStatus = liveStatuses[actorId];
            if (actorLiveStatus && !actorLiveStatus.isDisabled) {
                const actionKind = ALL_ACTIONS[action]?.key || action;
                if (['love', 'disable_action', 'freeze'].includes(actionKind)) {
                    disabledByAbilityPlayerIds.add(targetId);
                }
            }
        });
    });
    disabledByAbilityPlayerIds.forEach(pId => {
        if (liveStatuses[pId]) liveStatuses[pId].isDisabled = true;
    });

    // Xử lý các hành động còn lại
    const counterWards = {};    
    const counterShieldedTargets = new Set();
    const damageLinks = {};
    
    actions.forEach(({ actorId, targets, action }) => {
         (targets || []).forEach(targetId => {
            const actor = roomPlayers.find(p => p.id === actorId);
            const isWolfAction = actorId === 'wolf_group';

            if (!isWolfAction && actor && liveStatuses[actorId] && liveStatuses[actorId].isDisabled) return;
            if (!isWolfAction && !actor) return;
            
            const target = roomPlayers.find(p => p.id === targetId);
            const targetStatus = liveStatuses[targetId];
            if (!target || !targetStatus) return;
            
            const actionKind = ALL_ACTIONS[action]?.key || action;
            const duration = actor ? (actor.duration || '1') : '1';

            // Các hiệu ứng không gây sát thương trực tiếp
            if (actionKind === 'countershield') counterShieldedTargets.add(targetId);
            else if (actionKind === 'disable_action' && duration === 'n') finalStatus[targetId].isPermanentlyDisabled = true;
            else if (actionKind === 'freeze' && !counterShieldedTargets.has(targetId)) targetStatus.isProtected = true;
            else if (actionKind === 'gm_add_armor') targetStatus.armor++;
            else if (['protect', 'gm_protect'].includes(actionKind) && !counterShieldedTargets.has(targetId)) {
                targetStatus.isProtected = true;
                if (duration === 'n') finalStatus[targetId].isPermanentlyProtected = true;
            }
            else if (actionKind === 'sacrifice') {
                 damageRedirects[targetId] = actorId;
                 if (duration === 'n') finalStatus[actorId].sacrificedBy = targetId;
            }
            else if (actionKind === 'checkcounter') {
                counterWards[targetId] = { actorId: actorId, triggered: false };
                if (duration === 'n') finalStatus[targetId].hasPermanentCounterWard = true;
            }
            else if (actionKind === 'checkdmg' && liveStatuses[actorId]) {
                liveStatuses[actorId].deathLinkTarget = targetId;
                if (duration === 'n') finalStatus[actorId].deathLinkTarget = targetId;
            }
            else if (actionKind === 'givekill') {
                targetStatus.tempStatus.hasKillAbility = true;
                if (duration === 'n') finalStatus[targetId].hasPermanentKillAbility = true;
            }
            else if (actionKind === 'givearmor') {
                targetStatus.armor = 2;
                if (liveStatuses[actorId]) liveStatuses[actorId].armor = 2;
                damageRedirects[targetId] = actorId;
            }
            else if (actionKind === 'choosesacrifier' && finalStatus[actorId]) {
                finalStatus[actorId].sacrificedBy = targetId;
                damageRedirects[actorId] = targetId;
                infoResults.push(`- ${actor.roleName} (${actor.name}) đã chọn ${target.name} làm người thế mạng.`);
            }
            else if (actionKind === 'transform' && finalStatus[actorId]) {
                const newRoleData = allRolesData[target.roleName];
                if (newRoleData) {
                    finalStatus[actorId].transformedState = {
                        roleName: target.roleName, kind: newRoleData.kind, activeRule: newRoleData.active,
                        quantity: newRoleData.quantity, duration: newRoleData.duration
                    };
                    infoResults.push(`- ${actor.roleName} (${actor.name}) sẽ biến thành ${target.roleName} vào đêm mai.`);
                }
            }
            else if (actionKind === 'killdelay' && finalStatus[targetId]) {
                finalStatus[targetId].markedForDelayKill = true;
                infoResults.push(`- ${actor.roleName} (${actor.name}) đã nguyền rủa ${target.name}.`);
            }
            else if (actionKind === 'gather') targetStatus.gatheredBy = actorId;
            else if (actionKind === 'noti') {
                targetStatus.isNotified = true;
                if (duration === 'n') finalStatus[targetId].isPermanentlyNotified = true;
            }
            else if (actionKind === 'boom' && finalStatus[targetId]) finalStatus[targetId].isBoobyTrapped = true;
            else if (actionKind === 'love') {
                loveRedirects[targetId] = actorId;
                if(target.faction === 'Bầy Sói' && liveStatuses[actorId]) {
                    liveStatuses[actorId].damage++;
                    infoResults.push(`- ${actor.name} đã chết vì yêu nhầm Sói (${target.name}).`);
                }
            }
        });
    });

    // Xử lý chuyển hướng của Cupid (Yêu)
    let processedActions = JSON.parse(JSON.stringify(actions));
    processedActions.forEach(action => {
        if (['kill', 'curse'].includes(action.action) && action.actorId === 'wolf_group' && action.targets?.length > 0) {
            const originalTargetId = action.targets[0];
            const loverId = loveRedirects[originalTargetId];
            if (loverId) {
                const originalTarget = roomPlayers.find(p => p.id === originalTargetId);
                const newTarget = roomPlayers.find(p => p.id === loverId);
                const actionName = action.action === 'kill' ? 'Sói cắn' : 'Nguyền';
                if (originalTarget && newTarget) {
                    infoResults.push(`- ${newTarget.name} đã nhận thay ${actionName} cho ${originalTarget.name}.`);
                }
                action.targets = [loverId];
            }
        }
    });

    const disabledPlayerIds = new Set(Object.keys(liveStatuses).filter(pId => liveStatuses[pId].isDisabled));

    // Xử lý các hành động có thể gây sát thương và lấy thông tin
    const killifActions = processedActions.filter(({ action }) => (ALL_ACTIONS[action]?.key || action) === 'killif');
    const otherActions = processedActions.filter(({ action }) => !['killif', 'collect', 'transform', 'love', 'detect', 'shieldhouse', 'killwolfhouse', 'keeperhouse', 'trapperhouse'].includes(ALL_ACTIONS[action]?.key || action));
    
    otherActions.forEach(({ actorId, targets, action }) => {
        (targets || []).forEach(targetId => {
            if (gameMode === 'classic' && action === 'kill' && actorId === 'wolf_group') {
                const ultimateTargetId = damageRedirects[targetId] || targetId;
                const targetStatus = liveStatuses[ultimateTargetId];
                if (!targetStatus || targetStatus.isProtected) return;
                
                targetStatus.damage++;
                targetStatus.killedByWolfBite = true;

                if (targetStatus.isBoobyTrapped) {
                    const livingWolves = roomPlayers.filter(p => (p.faction === 'Bầy Sói' || p.faction === 'Phe Sói') && finalStatus[p.id]?.isAlive);
                    if (livingWolves.length > 0) {
                        const randomWolf = livingWolves[Math.floor(Math.random() * livingWolves.length)];
                        if (liveStatuses[randomWolf.id] && !liveStatuses[randomWolf.id].isProtected) {
                            liveStatuses[randomWolf.id].damage++;
                            infoResults.push(`- Sói ${randomWolf.name} đã chết do boom khi cắn ${roomPlayers.find(p=>p.id===ultimateTargetId).name}.`);
                        }
                    }
                    targetStatus.isBoobyTrapped = false;
                    finalStatus[ultimateTargetId].isBoobyTrapped = false;
                }
                return;
            }

            const attacker = roomPlayers.find(p => p.id === actorId);
            let target = roomPlayers.find(p => p.id === targetId);
            const actionKind = ALL_ACTIONS[action]?.key || action;

            if (disabledPlayerIds.has(actorId) && ['audit', 'invest', 'check'].includes(actionKind)) {
                 const fakeVillagerTarget = roomPlayers.find(p => p.baseFaction === 'Phe Dân');
                 target = fakeVillagerTarget || target;
            } else if (disabledPlayerIds.has(actorId)) {
                return;
            }

            if (!attacker || !target) return;
            
            const attackerHasKill = actionKind.includes('kill') || (liveStatuses[actorId] && liveStatuses[actorId].tempStatus.hasKillAbility);

            if (attackerHasKill && actionKind !== 'killdelay') {
                const ultimateTargetId = damageRedirects[targetId] || targetId;
                const finalTarget = roomPlayers.find(p => p.id === ultimateTargetId);
                const finalTargetStatus = liveStatuses[ultimateTargetId];
                
                if (!finalTarget || !finalTargetStatus || finalTargetStatus.isProtected) return;

                if (actionKind === 'killvillager' && finalTarget.roleName !== 'Dân') {
                    if (liveStatuses[actorId] && !liveStatuses[actorId].isProtected) liveStatuses[actorId].damage++;
                    return;
                }
                
                if(actionKind === 'killwolf' && !(finalTarget.faction === 'Bầy Sói' || finalTarget.faction === 'Phe Sói')) {
                    // Không gây sát thương nhưng vẫn có thể bị phản damage
                } else {
                     finalTargetStatus.damage++;
                }

                if (finalTargetStatus.isBoobyTrapped && liveStatuses[attacker.id] && !liveStatuses[attacker.id].isProtected) {
                    liveStatuses[attacker.id].damage++;
                    infoResults.push(`- ${attacker.name} bị nổ boom khi tấn công ${finalTarget.name}.`);
                    finalTargetStatus.isBoobyTrapped = false;
                    finalStatus[ultimateTargetId].isBoobyTrapped = false;
                }
                
                if (finalTarget.kind === 'counter' && liveStatuses[attacker.id] && !liveStatuses[attacker.id].isProtected) {
                    liveStatuses[attacker.id].damage++;
                }
                if (ultimateTargetId !== targetId && liveStatuses[attacker.id] && !liveStatuses[attacker.id].isProtected) {
                     liveStatuses[attacker.id].damage++;
                }
                const ward = counterWards[ultimateTargetId];
                if ((ward || finalStatus[ultimateTargetId]?.hasPermanentCounterWard) && (!ward || !ward.triggered) && liveStatuses[attacker.id] && !liveStatuses[attacker.id].isProtected) {
                    liveStatuses[attacker.id].damage++;
                    if (ward) ward.triggered = true;
                }
            }
            
            if (actionKind === 'audit') {
                const currentFaction = finalStatus[target.id]?.faction || target.faction;
                let isBaySoi = (currentFaction === 'Bầy Sói');
                if (target.kind.includes('reverse') || target.kind.includes('counteraudit')) isBaySoi = !isBaySoi;
                infoResults.push(`- ${attacker.roleName} (${attacker.name}) đã soi ${target.name}: ${isBaySoi ? "thuộc Bầy Sói" : "KHÔNG thuộc Bầy Sói"}.`);
            }
            if (actionKind === 'invest') {
                const currentFaction = finalStatus[target.id]?.faction || target.faction;
                infoResults.push(`- ${attacker.roleName} (${attacker.name}) đã điều tra ${target.name}: ${(currentFaction === 'Bầy Sói' || currentFaction === 'Phe Sói') ? "thuộc Phe Sói" : "KHÔNG thuộc Phe Sói"}.`);
            }
            if (actionKind === 'check') {
                infoResults.push(`- ${attacker.roleName} (${attacker.name}) đã kiểm tra ${target.name}.`);
            }
        });
    });

    // Xử lý Giết/Cứu (Killif)
    killifActions.forEach(({ actorId, targets }) => {
        (targets || []).forEach(targetId => {
            const attacker = roomPlayers.find(p => p.id === actorId);
            const target = roomPlayers.find(p => p.id === targetId);
            if (!attacker || !target) return;
            
            const finalTargetId = damageRedirects[targetId] || targetId;
            const targetStatus = liveStatuses[finalTargetId];
            if (targetStatus) {
                if (targetStatus.damage > 0) {
                    targetStatus.isSavedByKillif = true;
                    infoResults.push(`- ${attacker.roleName} (${attacker.name}) đã CỨU ${target.name}.`);
                } else if(!targetStatus.isProtected) {
                    targetStatus.damage++;
                }
            }
        });
    });

    // Xử lý các nhóm chịu sát thương chung (Tụ tập,...)
    const damageGroups = nightState.damageGroups || {};
    const groupDamageTotals = {};
    for (const groupId in damageGroups) {
        groupDamageTotals[groupId] = 0;
        damageGroups[groupId]?.members?.forEach(memberId => {
            if (liveStatuses[memberId]) groupDamageTotals[groupId] += liveStatuses[memberId].damage;
        });
    }
    Object.keys(liveStatuses).forEach(pId => {
        const playerStatus = liveStatuses[pId];
        if (playerStatus.groupId && groupDamageTotals[playerStatus.groupId] && !playerStatus.isProtected) {
            playerStatus.damage = groupDamageTotals[playerStatus.groupId];
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

    // Xử lý các hành động cứu
    processedActions.forEach(({ actorId, targets, action }) => {
         const actor = roomPlayers.find(p => p.id === actorId);
         if (!actor || disabledPlayerIds.has(actor.id)) return;
         
         (targets || []).forEach(targetId => {
            const actionKind = ALL_ACTIONS[action]?.key || action;
            if (actionKind.includes('save') || actionKind === 'gm_save') {
                const targetStatus = liveStatuses[targetId];
                if (targetStatus) {
                   if (actor.kind === 'save_gather' && targetStatus.gatheredBy && gatherGroups[targetStatus.gatheredBy]) {
                       gatherGroups[targetStatus.gatheredBy].forEach(pId => { if (liveStatuses[pId]) liveStatuses[pId].isSaved = true; });
                   } else {
                       targetStatus.isSaved = true;
                   }
                }
            }
        });
    });

    // Xử lý Cứu Hết (Save All) và Cứu Thế (Wizard)
    const didSaveAll = processedActions.some(a => (ALL_ACTIONS[a.action]?.key || a.action) === 'saveall' && a.targets?.includes(a.actorId));
    if(didSaveAll) infoResults.push(`- ${roomPlayers.find(p=>p.id===processedActions.find(a=>(ALL_ACTIONS[a.action]?.key || a.action) === 'saveall').actorId).name} đã cứu tất cả mọi người!`);

    const wizardAction = processedActions.find(a => (ALL_ACTIONS[a.action]?.key || a.action) === 'wizard_save');
    let wizardSavedPlayerNames = [];
    if (wizardAction) {
        const wizardId = wizardAction.actorId;
        const potentialDeaths = Object.keys(liveStatuses).filter(pId => liveStatuses[pId].damage >= (liveStatuses[pId].armor || 1) && !liveStatuses[pId].isSaved && !liveStatuses[pId].isSavedByKillif);
        if (potentialDeaths.length > 0) {
            potentialDeaths.forEach(deadPlayerId => {
                if (liveStatuses[deadPlayerId]) liveStatuses[deadPlayerId].isSaved = true;
                wizardSavedPlayerNames.push(roomPlayers.find(p => p.id === deadPlayerId)?.name || '???');
            });
            if (finalStatus[wizardId]) finalStatus[wizardId].wizardSaveSuccessful = true;
            infoResults.push(`- Wizard đã cứu sống: ${wizardSavedPlayerNames.join(', ')}.`);
        } else if (liveStatuses[wizardId] && !liveStatuses[wizardId].isProtected) {
            liveStatuses[wizardId].damage = 99;
            if (finalStatus[wizardId]) finalStatus[wizardId].wizardSaveFailed = true;
            infoResults.push(`- Wizard đã cố cứu thế nhưng không có ai chết và phải trả giá bằng mạng sống.`);
        }
    }

    // TÍNH TOÁN KẾT QUẢ CUỐI CÙNG
    let deadPlayerIdsThisNight = new Set();
    Object.keys(liveStatuses).forEach(pId => {
        const status = liveStatuses[pId];
        let finalDamage = status.damage;
        if (finalDamage > 0 && status.armor > 1) {
            const damageAbsorbed = Math.min(finalDamage, status.armor - 1);
            status.armor -= damageAbsorbed;
            finalDamage -= damageAbsorbed;
        }
        if (finalDamage > 0 && !(status.isSaved || status.isSavedByKillif || didSaveAll)) {
            const player = roomPlayers.find(p => p.id === pId);
            if (player.kind === 'delaykill' && status.delayKillAvailable) {
                finalStatus[pId].isDoomed = true;
                finalStatus[pId].delayKillAvailable = false;
            } else {
                finalStatus[pId].isAlive = false;
                finalStatus[pId].causeOfDeath = status.killedByWolfBite ? 'wolf_bite' : 'ability';
                deadPlayerIdsThisNight.add(pId);
            }
        }
        if (finalStatus[pId]) {
            finalStatus[pId].armor = status.armor;
            if (status.deathLinkTarget) finalStatus[pId].deathLinkTarget = status.deathLinkTarget;
            if (initialStatus[pId].isPermanentlyDisabled) finalStatus[pId].isPermanentlyDisabled = true;
        }
    });
    
    // Xử lý hiệu ứng chết chùm (Death Link)
    let chainReactionOccurred = true;
    while(chainReactionOccurred) {
        chainReactionOccurred = false;
        const newlyDead = [];
        Array.from(deadPlayerIdsThisNight).forEach(deadPlayerId => {
            const linkedTargetId = finalStatus[deadPlayerId]?.deathLinkTarget;
            if (linkedTargetId && finalStatus[linkedTargetId]?.isAlive && !deadPlayerIdsThisNight.has(linkedTargetId)) {
                const targetLiveStatus = liveStatuses[linkedTargetId];
                if (!(targetLiveStatus?.isProtected || targetLiveStatus?.isSaved || targetLiveStatus?.isSavedByKillif || didSaveAll)) {
                    finalStatus[linkedTargetId].isAlive = false;
                    finalStatus[linkedTargetId].causeOfDeath = 'death_link';
                    newlyDead.push(linkedTargetId);
                    chainReactionOccurred = true;
                    infoResults.push(`- ${roomPlayers.find(p=>p.id===linkedTargetId).name} đã chết do liên kết với ${roomPlayers.find(p=>p.id===deadPlayerId).name}.`);
                } else {
                    infoResults.push(`- ${roomPlayers.find(p=>p.id===linkedTargetId).name} đã được cứu/bảo vệ khỏi hiệu ứng chết chùm.`);
                }
            }
        });
        newlyDead.forEach(id => deadPlayerIdsThisNight.add(id));
    }

    const deadPlayerNames = Array.from(deadPlayerIdsThisNight).map(id => roomPlayers.find(p => p.id === id)?.name).filter(Boolean);
    
    return { liveStatuses, finalStatus, deadPlayerNames, infoResults, loveRedirects, wizardSavedPlayerNames };
}