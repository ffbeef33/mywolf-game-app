// =================================================================
// === interactive-gm.js - CẬP NHẬT LOG ASSASSIN ===
// =================================================================

document.addEventListener('DOMContentLoaded', () => {
    // --- Cấu hình Firebase ---
    const firebaseConfig = {
        apiKey: "AIzaSyAYUuNxsYWI59ahvjKHZujKyTfi95DzNwU",
        authDomain: "mywolf-game.firebaseapp.com",
        databaseURL: "https://mywolf-game-default-rtdb.asia-southeast1.firebasedatabase.app",
        projectId: "mywolf-game",
        storageBucket: "mywolf-game.appspot.com",
        messagingSenderId: "1099375631706",
        appId: "1:1099375631706:web:a1f6ccbcf71b7176046763"
    };
    firebase.initializeApp(firebaseConfig);
    const database = firebase.database();

    // --- DOM Elements ---
    const roomIdDisplay = document.getElementById('room-id-display');
    const currentPhaseDisplay = document.getElementById('current-phase-display');
    const playerListUI = document.getElementById('player-list');
    const playersTotalDisplay = document.getElementById('players-total');
    const gameLog = document.getElementById('game-log');
    const startNightBtn = document.getElementById('start-night-btn');
    const endNightBtn = document.getElementById('end-night-btn');
    const startDayBtn = document.getElementById('start-day-btn');
    const startVoteBtn = document.getElementById('start-vote-btn');
    const endGameBtn = document.getElementById('end-game-btn');

    // --- State ---
    let currentRoomId = null;
    let roomListener = null;
    let actionLogListener = null;
    let roomData = {};
    let allRolesData = {};

    const initialize = async () => {
        const urlParams = new URLSearchParams(window.location.search);
        currentRoomId = urlParams.get('roomId');
        if (!currentRoomId) {
            document.body.innerHTML = '<h1>Lỗi: Không tìm thấy ID phòng trong URL.</h1>';
            return;
        }
        await fetchAllRolesData();
        roomIdDisplay.textContent = currentRoomId;
        attachListenersToRoom();
    };

    const fetchAllRolesData = async () => {
        try {
            const response = await fetch(`/api/sheets?sheetName=Roles`);
            const rawData = await response.json();
            allRolesData = rawData.reduce((acc, role) => {
                if (role.RoleName) {
                    const roleName = role.RoleName.trim();
                     acc[roleName] = {
                        name: roleName,
                        faction: (role.Faction || 'Chưa phân loại').trim(),
                        active: (role.Active || 'n').trim().toLowerCase(),
                        kind: (role.Kind || 'empty').trim(),
                        quantity: parseInt(role.Quantity, 10) || 1,
                        duration: (role.Duration || '1').toString().trim().toLowerCase()
                    };
                }
                return acc;
            }, {});
        } catch (error) {
            console.error("Lỗi tải dữ liệu vai trò:", error);
        }
    };

    const attachListenersToRoom = () => {
        if (roomListener) database.ref(`rooms/${currentRoomId}`).off('value', roomListener);
        const roomRef = database.ref(`rooms/${currentRoomId}`);
        roomListener = roomRef.on('value', (snapshot) => {
            if (!snapshot.exists()) {
                alert("Phòng không còn tồn tại!");
                return;
            }
            roomData = snapshot.val();
            render();
            const currentNight = roomData.interactiveState?.currentNight || 0;
            if (currentNight > 0) {
                attachActionLogListener(currentNight);
            }
        });
    };
    
    const attachActionLogListener = (nightNumber) => {
        const actionLogRef = database.ref(`rooms/${currentRoomId}/nightActions/${nightNumber}`);
        if(actionLogListener) {
            actionLogListener.off();
        }
        actionLogListener = actionLogRef;
        actionLogListener.on('value', (snapshot) => {
            const actions = snapshot.val() || {};
            renderActionLog(actions);
        });
    }

    const render = () => {
        renderPlayerList();
        renderGameState();
    };
    
    const renderActionLog = (actions) => {
        gameLog.innerHTML = '';
        if (Object.keys(actions).length === 0) {
            gameLog.innerHTML = '<p><em>Chưa có người chơi nào hành động...</em></p>';
            return;
        }
        for(const actorId in actions) {
            const actionData = actions[actorId];
            let targetNames = '';

            if (actorId === 'wolf_group') {
                const wolfVotes = actionData.votes || {};
                const targets = Object.values(wolfVotes);
                const uniqueTargets = [...new Set(targets)]; 
                targetNames = uniqueTargets.map(targetId => roomData.players[targetId]?.name || 'Mục tiêu lạ').join(', ');
            } else {
                 const targets = Array.isArray(actionData.targets) ? actionData.targets : [actionData.targetId];
                 targetNames = targets.filter(Boolean).map(targetId => roomData.players[targetId]?.name || 'Mục tiêu lạ').join(', ');
            }
            
            let actorName = "Bầy Sói";
            let actionLabel = "Hành động lạ";

            if (actionData.action === 'wizard_save') {
                actionLabel = "Cứu Thế";
                targetNames = "(Toàn bộ)";
            } else if (actionData.action === 'assassinate') {
                actionLabel = `Ám sát (Đoán: ${actionData.guess})`;
            }
            else {
                actionLabel = ALL_ACTIONS[actionData.action]?.label || actionData.action;
            }

            if (actorId !== 'wolf_group') {
                actorName = roomData.players[actorId]?.name || 'Người chơi không xác định';
            }
            
            const p = document.createElement('p');
            p.innerHTML = `[ĐÊM] <strong>${actorName}</strong> đã chọn <em>${actionLabel}</em> <strong>${targetNames}</strong>.`;
            gameLog.prepend(p);
        }
    }

    const renderPlayerList = () => {
        const players = roomData.players || {};
        playerListUI.innerHTML = '';
        playersTotalDisplay.textContent = Object.keys(players).length;

        const playersByFaction = {
            'Bầy Sói': [], 'Phe Sói': [], 'Phe Dân': [], 'Phe trung lập': [], 'Khác': []
        };

        Object.entries(players).forEach(([id, player]) => {
            const roleName = player.roleName || '';
            const roleData = allRolesData[roleName] || {};
            const faction = roleData.faction || 'Khác';
            
            if (playersByFaction.hasOwnProperty(faction)) {
                playersByFaction[faction].push({ id, ...player });
            } else {
                playersByFaction['Khác'].push({ id, ...player });
            }
        });

        const factionOrder = ['Bầy Sói', 'Phe Sói', 'Phe Dân', 'Phe trung lập', 'Khác'];

        factionOrder.forEach(faction => {
            const groupPlayers = playersByFaction[faction];
            if (groupPlayers.length > 0) {
                const headerLi = document.createElement('li');
                headerLi.className = 'faction-header-li';
                headerLi.textContent = faction;
                playerListUI.appendChild(headerLi);

                groupPlayers.sort((a, b) => a.name.localeCompare(b.name)).forEach(player => {
                    const li = document.createElement('li');
                    li.className = 'player-item';
                    if (!player.isAlive) {
                        li.classList.add('dead');
                    }
                    li.innerHTML = `
                        <span class="player-name">${player.name} <strong>(${player.roleName || 'Chưa có vai'})</strong></span>
                        <button class="btn-secondary gm-action-btn" data-player-id="${player.id}" data-player-name="${player.name}">Hành động</button>
                    `;
                    playerListUI.appendChild(li);
                });
            }
        });
    };
    
    const renderGameState = () => {
        const state = roomData.interactiveState || { phase: 'setup', currentNight: 0 };
        startNightBtn.disabled = true;
        endNightBtn.disabled = true;
        startDayBtn.disabled = true;
        startVoteBtn.disabled = true;
        let phaseText = "Thiết lập";

        startNightBtn.innerHTML = '<i class="fas fa-moon"></i> Bắt Đầu Đêm';

        switch (state.phase) {
            case 'setup':
                phaseText = "Sẵn sàng bắt đầu";
                startNightBtn.disabled = false;
                break;
            case 'night':
                phaseText = `Đêm ${state.currentNight}`;
                endNightBtn.disabled = false;
                gameLog.innerHTML = '<p><em>Đang chờ người chơi hành động...</em></p>';
                break;
            case 'day':
                phaseText = `Thảo luận ngày ${state.currentNight}`;
                startNightBtn.disabled = false; 
                startDayBtn.disabled = false;
                startVoteBtn.disabled = false;
                startNightBtn.innerHTML = '<i class="fas fa-moon"></i> Bắt Đầu Đêm Tiếp Theo';
                break;
            case 'voting':
                 phaseText = `Bỏ phiếu Ngày ${state.currentNight}`;
                 startNightBtn.disabled = false;
                 startNightBtn.innerHTML = '<i class="fas fa-moon"></i> Bắt Đầu Đêm Tiếp Theo';
                 break;
            case 'ended':
                phaseText = "Game đã kết thúc";
                startNightBtn.disabled = false;
                startNightBtn.innerHTML = '<i class="fas fa-redo"></i> Bắt Đầu Game Mới';
                break;
        }
        currentPhaseDisplay.textContent = phaseText;
    };
    
    const processNightResults = async () => {
        endNightBtn.disabled = true;
        endNightBtn.textContent = "Đang xử lý...";

        const state = roomData.interactiveState;
        const currentNight = state.currentNight;
        const playerActions = roomData.nightActions?.[currentNight] || {};
        const allPlayers = roomData.players;

        const initialPlayerStatus = Object.fromEntries(
            Object.entries(allPlayers).map(([id, player]) => {
                const roleName = player.roleName || "";
                const roleInfo = allRolesData[roleName] || {};
                const kind = roleInfo.kind || 'empty';
                const status = { 
                    isAlive: player.isAlive,
                    faction: roleInfo.faction || 'Chưa phân loại',
                    roleName: roleName,
                    kind: kind,
                    isDisabled: false, isPermanentlyDisabled: false, isPermanentlyProtected: false,
                    isPermanentlyNotified: false, hasPermanentKillAbility: false, hasPermanentCounterWard: false,
                    armor: (kind === 'armor1' ? 2 : 1),
                    delayKillAvailable: (kind === 'delaykill'),
                    isDoomed: false, deathLinkTarget: null, sacrificedBy: null,
                    transformedState: null, groupId: null, markedForDelayKill: false,
                    originalRoleName: null, activeRule: roleInfo.active || 'n',
                    quantity: roleInfo.quantity || 1, duration: roleInfo.duration || '1',
                    isBoobyTrapped: false,
                };

                if (roleInfo.kind === 'wizard') {
                    status.wizardAbilityState = player.wizardAbilityState || 'save_available';
                }

                return [id, status];
            })
        );
        
        let actionIdCounter = 0;
        const formattedActions = [];
        const updates = {}; 

        for (const actorId in playerActions) {
            const actionData = playerActions[actorId];

            if (actorId === 'wolf_group') {
                const wolfAction = actionData.action;
                const wolfVotes = actionData.votes || {};
                if (Object.keys(wolfVotes).length === 0) continue;

                const voteCounts = Object.values(wolfVotes).reduce((acc, targetId) => {
                    acc[targetId] = (acc[targetId] || 0) + 1;
                    return acc;
                }, {});
                const maxVotes = Math.max(...Object.values(voteCounts));
                const tiedTargets = Object.keys(voteCounts).filter(targetId => voteCounts[targetId] === maxVotes);
                const finalTargetId = tiedTargets.length > 0 ? tiedTargets[Math.floor(Math.random() * tiedTargets.length)] : null;

                if (finalTargetId) {
                    if (wolfAction === 'curse') {
                       // ... curse logic ...
                    } else { 
                        formattedActions.push({
                            id: actionIdCounter++,
                            actorId: 'wolf_group',
                            targets: [finalTargetId],
                            action: 'kill'
                        });
                    }
                }
            } 
            else if (actionData.action === 'assassinate') {
                const assassin = allPlayers[actorId];
                const target = allPlayers[actionData.targetId];
                if (!assassin || !target) continue;
                
                const actualRole = target.roleName;
                const guessedRole = actionData.guess;

                // THAY ĐỔI: Tin nhắn trung lập
                updates[`/nightResults/${currentNight}/private/${actorId}`] = `Bạn đã chọn ám sát ${target.name}. Kết quả sẽ được định đoạt vào sáng mai.`;

                if (actualRole === guessedRole) {
                    // Đoán đúng, giết mục tiêu
                    formattedActions.push({
                        id: actionIdCounter++,
                        actorId: actorId,
                        targets: [actionData.targetId],
                        action: 'kill'
                    });
                } else {
                    // Đoán sai, tự sát
                    formattedActions.push({
                        id: actionIdCounter++,
                        actorId: actorId,
                        targets: [actorId],
                        action: 'kill'
                    });
                }
            }
            else {
                formattedActions.push({
                    id: actionIdCounter++,
                    actorId: actorId,
                    targets: Array.isArray(actionData.targets) ? actionData.targets : [],
                    action: actionData.action
                });
            }
        }
        
        const nightStateForCalc = {
            actions: formattedActions,
            playersStatus: initialPlayerStatus,
            initialPlayersStatus: JSON.parse(JSON.stringify(initialPlayerStatus))
        };

        const roomPlayersForCalc = Object.entries(allPlayers).map(([id, data]) => {
            const roleInfo = allRolesData[data.roleName] || {};
            return { 
                id, ...data, 
                baseFaction: roleInfo.faction || 'Chưa phân loại',
                faction: roleInfo.faction || 'Chưa phân loại',
                kind: roleInfo.kind || 'empty',
                activeRule: roleInfo.active || 'n',
                quantity: roleInfo.quantity || 1,
                duration: roleInfo.duration || '1'
            };
        });
        
        const results = calculateNightStatus(nightStateForCalc, roomPlayersForCalc);
        const { finalStatus, deadPlayerNames, infoResults, wizardSavedPlayerNames } = results;
        
        Object.keys(finalStatus).forEach(playerId => {
            const originalPlayerState = initialPlayerStatus[playerId];
            const finalPlayerState = finalStatus[playerId];
            if (originalPlayerState?.isAlive && !finalPlayerState.isAlive) {
                updates[`/players/${playerId}/isAlive`] = false;

                const deadPlayerRole = allRolesData[originalPlayerState.roleName] || {};
                const isWolf = deadPlayerRole.faction === 'Bầy Sói' || deadPlayerRole.faction === 'Phe Sói';
                const curseState = roomData.interactiveState?.curseAbility?.status || 'locked';

                if (isWolf && curseState === 'locked') {
                    updates['/interactiveState/curseAbility/status'] = 'available';
                }
            }
        });

        const wizardPlayerEntry = Object.entries(allPlayers).find(([id, p]) => {
            const roleInfo = allRolesData[p.roleName] || {};
            return roleInfo.kind === 'wizard';
        });

        if (wizardPlayerEntry) {
            const wizardId = wizardPlayerEntry[0];
            const wizardFinalStatus = finalStatus[wizardId];
            const wizardAction = playerActions[wizardId];

            if (wizardFinalStatus) {
                if (wizardFinalStatus.wizardSaveSuccessful) {
                    updates[`/players/${wizardId}/wizardAbilityState`] = 'kill_available';
                    const savedNames = wizardSavedPlayerNames.join(', ');
                    updates[`/nightResults/${currentNight}/private/${wizardId}`] = `Bạn đã cứu thế thành công! Những người được cứu: ${savedNames}. Bạn nhận được 1 lần Giết vào đêm tiếp theo.`;
                } else if (wizardFinalStatus.wizardSaveFailed) {
                    updates[`/players/${wizardId}/wizardAbilityState`] = 'used';
                    updates[`/nightResults/${currentNight}/private/${wizardId}`] = 'Bạn đã dùng Cứu Thế nhưng không có ai chết. Bạn đã phải trả giá bằng mạng sống của mình.';
                } else if (wizardAction && wizardAction.action === 'wizard_kill') {
                    updates[`/players/${wizardId}/wizardAbilityState`] = 'used';
                }
            }
        }

        updates[`/nightResults/${currentNight}/public`] = {
            deadPlayerNames: deadPlayerNames || [],
            log: infoResults || [],
            timestamp: firebase.database.ServerValue.TIMESTAMP
        };
        
        infoResults.forEach(logString => {
            const match = logString.match(/- (.+?) \((.+?)\) đã (soi|điều tra|kiểm tra) (.+?): (.+)\./);
            if (match) {
                const [, roleName, actorName, action, targetName, result] = match;
                const actor = Object.entries(allPlayers).find(([id, p]) => p.name === actorName);
                if (actor) {
                    const actorId = actor[0];
                    updates[`/nightResults/${currentNight}/private/${actorId}`] = `Bạn đã ${action} ${targetName} và kết quả là: ${result}`;
                }
            }
        });

        updates[`/interactiveState/phase`] = 'day';
        updates[`/interactiveState/message`] = `Trời sáng! ${deadPlayerNames.length > 0 ? `Đêm qua đã có ${deadPlayerNames.join(', ')} bị giết.` : 'Đêm qua không có ai chết.'}`;

        try {
            await database.ref(`rooms/${currentRoomId}`).update(updates);
        } catch (error) {
            console.error("Lỗi khi cập nhật kết quả đêm:", error);
        } finally {
            endNightBtn.disabled = false;
            endNightBtn.innerHTML = '<i class="fas fa-sun"></i> Kết Thúc Đêm & Xử Lý';
        }
    };

    // --- Xử lý sự kiện nhấn nút ---
    startNightBtn.addEventListener('click', () => {
        const state = roomData.interactiveState || {};
        
        if (state.phase === 'ended') {
            if(!confirm("Bạn có muốn reset và bắt đầu game mới không? Hành động này sẽ xóa toàn bộ lịch sử đêm và hồi sinh người chơi.")) return;
            
            const updates = {};
            Object.keys(roomData.players).forEach(pId => {
                updates[`/players/${pId}/isAlive`] = true;
                updates[`/players/${pId}/roleName`] = null; 
            });

            updates['/nightActions'] = null;
            updates['/nightResults'] = null;
            updates['/interactiveLog'] = null;
            updates['/interactiveState'] = {
                phase: 'setup',
                currentNight: 0,
                message: `Game đã được reset. Chờ Quản trò chia lại vai trò.`,
                curseAbility: { status: 'locked' } 
            };
            
            database.ref(`rooms/${currentRoomId}`).update(updates);
            alert("Game đã được reset! Vui lòng quay lại trang Admin để bắt đầu chia lại vai trò cho ván mới.");
            return;
        }

        const currentNightNumber = (state.currentNight || 0) + 1;
        const updates = {
            phase: 'night',
            currentNight: currentNightNumber,
            message: `Đêm ${currentNightNumber} bắt đầu.`
        };
        
        if (!state.curseAbility) {
            updates['curseAbility'] = { status: 'locked' };
        }
        
        database.ref(`rooms/${currentRoomId}/interactiveState`).update(updates);
    });

    endNightBtn.addEventListener('click', processNightResults);
    startDayBtn.addEventListener('click', () => {
        const currentNightNumber = roomData.interactiveState?.currentNight || 1;
        database.ref(`rooms/${currentRoomId}/interactiveState`).update({
            phase: 'day',
            message: `Ngày ${currentNightNumber}. Mọi người thảo luận.`
        });
    });
    startVoteBtn.addEventListener('click', () => {
        const currentNightNumber = roomData.interactiveState?.currentNight || 1;
         database.ref(`rooms/${currentRoomId}/interactiveState`).update({
            phase: 'voting',
            message: `Ngày ${currentNightNumber}. Bắt đầu bỏ phiếu.`
        });
    });
    endGameBtn.addEventListener('click', () => {
        if (!confirm('Bạn có chắc muốn kết thúc ván chơi này?')) return;
        const newState = {
            phase: 'ended',
            message: `Game đã kết thúc bởi Quản trò.`
        };
        database.ref(`rooms/${currentRoomId}/interactiveState`).update(newState);
    });
    playerListUI.addEventListener('click', (e) => {
        if (e.target && e.target.classList.contains('gm-action-btn')) {
            const playerId = e.target.dataset.playerId;
            const playerName = e.target.dataset.playerName;
            const player = roomData.players[playerId];
            if (!player) return;
            const action = prompt(`Chọn hành động cho ${playerName}:\n1: Giết\n2: Hồi sinh\n(Nhập 1 hoặc 2)`);
            const playerRef = database.ref(`rooms/${currentRoomId}/players/${playerId}/isAlive`);
            if (action === '1') {
                if (confirm(`Bạn có chắc muốn GIẾT ${playerName}?`)) {
                    playerRef.set(false);
                }
            } else if (action === '2') {
                if (confirm(`Bạn có chắc muốn HỒI SINH ${playerName}?`)) {
                    playerRef.set(true);
                }
            }
        }
    });

    initialize();
});