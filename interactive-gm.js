// =================================================================
// === interactive-gm.js - SỬA LỖI LOGIC DETECT CHO SÓI CẮN ===
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
    const playerGridUI = document.getElementById('player-grid');
    const playersTotalDisplay = document.getElementById('players-total');
    const gameLog = document.getElementById('game-log');
    const startNightBtn = document.getElementById('start-night-btn');
    const endNightBtn = document.getElementById('end-night-btn');
    const startDayBtn = document.getElementById('start-day-btn');
    const interactiveStartVoteBtn = document.getElementById('interactive-start-vote-btn');
    const endGameBtn = document.getElementById('end-game-btn');

    // --- Thêm DOM Elements cho Module Vote ---
    const votingSection = document.getElementById('voting-section');
    const startVoteNowBtn = document.getElementById('start-vote-now-btn');
    const endVoteNowBtn = document.getElementById('end-vote-now-btn');
    const votePlayersList = document.getElementById('vote-players-list');
    const voteResultsContainer = document.getElementById('vote-results-container');

    // --- State ---
    let currentRoomId = null;
    let roomListener = null;
    let roomData = {};
    let allRolesData = {};
    let voteTimerInterval = null;
    let voteChoicesListener = null;
    let rememberedVoteWeights = {};
    let secretVoteWeights = {};


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
        attachVoteButtonListeners(); 
        initializeCollapsibleSections(); 
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
        });
    };
    
    const render = () => {
        renderPlayerList();
        renderGameState();
        renderFullGameLog();
        renderVotingModule();
    };
    
    const renderFullGameLog = () => {
        gameLog.innerHTML = '';
        const state = roomData.interactiveState || {};
        const nightActions = roomData.nightActions || {};
        const nightResults = roomData.nightResults || {};
        const currentNight = state.currentNight || 0;

        if (currentNight === 0) {
            gameLog.innerHTML = '<p><em>Chưa có hoạt động nào...</em></p>';
            return;
        }

        for (let i = 1; i <= currentNight; i++) {
            const nightHeader = document.createElement('h4');
            nightHeader.className = 'log-night-header';
            nightHeader.textContent = `--- ĐÊM ${i} ---`;
            gameLog.appendChild(nightHeader);

            const actions = nightActions[i] || {};
            const results = nightResults[i]?.public;

            if (Object.keys(actions).length > 0) {
                 for(const actorId in actions) {
                    const actionData = actions[actorId];
                    let targetNames = '';

                    if (actorId === 'wolf_group') {
                        const wolfVotes = actionData.votes || {};
                        targetNames = Object.values(wolfVotes).map(targetId => roomData.players[targetId]?.name || 'Mục tiêu lạ').join(', ');
                    } else {
                         const targets = Array.isArray(actionData.targets) ? actionData.targets : [actionData.targetId];
                         targetNames = targets.filter(Boolean).map(targetId => roomData.players[targetId]?.name || 'Mục tiêu lạ').join(', ');
                    }
                    
                    let actorName = (actorId === 'wolf_group') ? "Bầy Sói" : (roomData.players[actorId]?.name || 'Người chơi lạ');
                    let actionLabel = ALL_ACTIONS[actionData.action]?.label || actionData.action;
                    if(actionData.action === 'assassinate') actionLabel += ` (Đoán: ${actionData.guess})`;

                    const p = document.createElement('p');
                    p.className = 'log-action';
                    p.innerHTML = `<strong>${actorName}</strong> đã chọn <em>${actionLabel}</em> <strong>${targetNames}</strong>.`;
                    gameLog.appendChild(p);
                }
            } else if (i < currentNight || (i === currentNight && state.phase !== 'night')) {
                gameLog.innerHTML += '<p><em>Không có hành động nào được ghi nhận cho đêm này.</em></p>';
            }

            if (results) {
                const resultsContainer = document.createElement('div');
                resultsContainer.className = 'log-results';
                let resultsHTML = '<h5>Kết Quả Đêm</h5>';

                if (results.deadPlayerNames && results.deadPlayerNames.length > 0) {
                    resultsHTML += `<p class="log-death"><i class="fas fa-skull-crossbones"></i><strong>Chết:</strong> ${results.deadPlayerNames.join(', ')}</p>`;
                } else {
                    resultsHTML += `<p><i class="fas fa-shield-alt"></i>Không có ai chết.</p>`;
                }

                if (results.log && results.log.length > 0) {
                    results.log.forEach(info => {
                         resultsHTML += `<p class="log-info"><i class="fas fa-search"></i>${info}</p>`;
                    });
                }
                resultsContainer.innerHTML = resultsHTML;
                gameLog.appendChild(resultsContainer);
            } 
            else if (i === currentNight && state.phase === 'night' && Object.keys(actions).length === 0) {
                 const waitingText = document.createElement('p');
                 waitingText.innerHTML = '<em>Đang chờ người chơi hành động...</em>';
                 gameLog.appendChild(waitingText);
            }
        }
    };

    const renderPlayerList = () => {
        const players = roomData.players || {};
        playerGridUI.innerHTML = '';
        playersTotalDisplay.textContent = Object.keys(players).length;

        const getFactionClass = (faction) => {
            switch (faction) {
                case 'Bầy Sói':
                case 'Phe Sói':
                    return 'faction-wolf';
                case 'Phe Dân':
                    return 'faction-villager';
                case 'Phe trung lập':
                    return 'faction-neutral';
                default:
                    return 'faction-other';
            }
        };
        
        const sortedPlayers = Object.entries(players).sort(([, a], [, b]) => {
            const roleA = allRolesData[a.roleName] || {};
            const roleB = allRolesData[b.roleName] || {};
            const factionA = roleA.faction || 'Z';
            const factionB = roleB.faction || 'Z';
            return factionA.localeCompare(factionB) || a.name.localeCompare(b.name);
        });

        sortedPlayers.forEach(([id, player]) => {
            const roleName = player.roleName || 'Chưa có vai';
            const roleData = allRolesData[roleName] || {};
            const faction = roleData.faction || 'Khác';

            const card = document.createElement('div');
            card.className = 'interactive-player-card';
            card.classList.add(getFactionClass(faction));

            if (!player.isAlive) {
                card.classList.add('dead');
            }

            const statusIcon = player.isAlive 
                ? '<i class="fas fa-heart"></i>' 
                : '<i class="fas fa-heart-crack"></i>';

            card.innerHTML = `
                <div class="player-status">${statusIcon}</div>
                <p class="player-name" title="${player.name}">${player.name}</p>
                <p class="player-role">${roleName}</p>
                <button class="btn-secondary gm-action-btn" data-player-id="${id}" data-player-name="${player.name}">Hành động</button>
            `;
            playerGridUI.appendChild(card);
        });
    };
    
    const renderGameState = () => {
        const state = roomData.interactiveState || { phase: 'setup', currentNight: 0 };
        startNightBtn.disabled = true;
        endNightBtn.disabled = true;
        startDayBtn.disabled = true;
        interactiveStartVoteBtn.disabled = true;
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
                break;
            case 'day':
                phaseText = `Thảo luận ngày ${state.currentNight}`;
                startNightBtn.disabled = false; 
                startDayBtn.disabled = false;
                interactiveStartVoteBtn.disabled = false;
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
                
                // === BẮT ĐẦU THAY ĐỔI TỪ ĐÂY ===
            
                // Xử lý hành động của Sói một cách tường minh để đảm bảo tính chính xác
                let actionToPerform = null;
                if (wolfAction === 'kill') { // Hành động "Cắn"
                    actionToPerform = 'kill';
                } else if (wolfAction === 'curse') { // Hành động "Nguyền"
                    actionToPerform = 'curse';
                } else {
                    // Mặc định là cắn nếu không có hành động cụ thể (để tương thích ngược)
                    actionToPerform = 'kill';
                }
            
                // Chỉ thêm hành động vào hàng đợi nếu có mục tiêu và hành động hợp lệ
                if (finalTargetId && actionToPerform) {
                    formattedActions.push({
                        id: actionIdCounter++,
                        actorId: 'wolf_group',
                        targets: [finalTargetId],
                        action: actionToPerform
                    });
                }
                // === KẾT THÚC THAY ĐỔI ===
            } 
            else if (actionData.action === 'assassinate') {
                const assassin = allPlayers[actorId];
                const target = allPlayers[actionData.targetId];
                if (!assassin || !target) continue;
                
                const actualRole = target.roleName;
                const guessedRole = actionData.guess;

                updates[`/nightResults/${currentNight}/private/${actorId}`] = `Bạn đã chọn ám sát ${target.name}. Kết quả sẽ được định đoạt vào sáng mai.`;

                if (actualRole === guessedRole) {
                    formattedActions.push({
                        id: actionIdCounter++, actorId: actorId, targets: [actionData.targetId], action: 'kill'
                    });
                } else {
                    formattedActions.push({
                        id: actionIdCounter++, actorId: actorId, targets: [actorId], action: 'kill'
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

        const wizardPlayerEntry = Object.entries(allPlayers).find(([, p]) => (allRolesData[p.roleName] || {}).kind === 'wizard');

        if (wizardPlayerEntry) {
            const wizardId = wizardPlayerEntry[0];
            const wizardFinalStatus = finalStatus[wizardId];
            const wizardAction = playerActions[wizardId];

            if (wizardFinalStatus) {
                if (wizardFinalStatus.wizardSaveSuccessful) {
                    updates[`/players/${wizardId}/wizardAbilityState`] = 'kill_available';
                    updates[`/nightResults/${currentNight}/private/${wizardId}`] = `Bạn đã cứu thế thành công! Những người được cứu: ${wizardSavedPlayerNames.join(', ')}. Bạn nhận được 1 lần Giết vào đêm tiếp theo.`;
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
            const match = logString.match(/- (.+?) \((.+?)\) đã (soi|điều tra|kiểm tra|điều tra xác chết) (.+?): (.+)\./);
            if (match) {
                const [, , actorName, action, targetName, result] = match;
                const actor = Object.values(allPlayers).find(p => p.name === actorName);
                const actorId = Object.keys(allPlayers).find(id => allPlayers[id] === actor);
                if (actorId) {
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
        votingSection.classList.add('hidden');
    });
    interactiveStartVoteBtn.addEventListener('click', () => {
        const currentNightNumber = roomData.interactiveState?.currentNight || 1;
        database.ref(`rooms/${currentRoomId}/interactiveState`).update({
            phase: 'voting',
            message: `Ngày ${currentNightNumber}. Bắt đầu bỏ phiếu.`
        });
        votingSection.classList.remove('hidden');
    });
    endGameBtn.addEventListener('click', () => {
        if (!confirm('Bạn có chắc muốn kết thúc ván chơi này?')) return;
        const newState = {
            phase: 'ended',
            message: `Game đã kết thúc bởi Quản trò.`
        };
        database.ref(`rooms/${currentRoomId}/interactiveState`).update(newState);
    });
    playerGridUI.addEventListener('click', (e) => {
        const actionButton = e.target.closest('.gm-action-btn');
        if (actionButton) {
            const playerId = actionButton.dataset.playerId;
            const playerName = actionButton.dataset.playerName;
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

    function renderVotingModule() {
        if (!roomData || !roomData.players) return;
        
        const livingPlayers = Object.entries(roomData.players).filter(([,p]) => p.isAlive);
        votePlayersList.innerHTML = '<h4>Thiết lập phiếu vote:</h4>';
        
        if (livingPlayers.length > 0) {
            livingPlayers.sort(([,a],[,b]) => a.name.localeCompare(b.name)).forEach(([id, player]) => {
                const playerRow = document.createElement('div');
                playerRow.className = 'vote-player-row';
                const currentWeight = rememberedVoteWeights[id] ?? 1;
                playerRow.innerHTML = `
                    <span class="vote-player-name">${player.name} (${player.roleName || 'Chưa rõ'})</span>
                    <div class="vote-weight-controls">
                        <button class="weight-btn minus" data-player-id="${id}" title="Giảm phiếu">-</button>
                        <span class="vote-weight-display" id="weight-display-${id}">${currentWeight}</span>
                        <button class="weight-btn plus" data-player-id="${id}" title="Tăng phiếu">+</button>
                    </div>
                `;
                votePlayersList.appendChild(playerRow);
            });
        } else {
            votePlayersList.innerHTML += '<p>Không có người chơi nào còn sống để vote.</p>';
        }
    }

    function handleStartVote() {
        if (!currentRoomId) return;
        secretVoteWeights = {};
        const voteWeightDisplays = document.querySelectorAll('.vote-weight-display');
        voteWeightDisplays.forEach(display => {
            const playerId = display.id.replace('weight-display-', '');
            const weight = parseInt(display.textContent, 10);
            if (playerId && !isNaN(weight)) {
                secretVoteWeights[playerId] = weight;
            }
        });
        
        const livingPlayers = Object.entries(roomData.players).filter(([,p]) => p.isAlive);
        const candidates = livingPlayers.reduce((acc, [id, p]) => {
            acc[id] = p.name;
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

        const voteRef = database.ref(`rooms/${currentRoomId}/votingState`);
        voteRef.set(votingState).then(() => {
            startVoteNowBtn.style.display = 'none';
            endVoteNowBtn.style.display = 'inline-block';
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

            const choicesRef = database.ref(`rooms/${currentRoomId}/votingState/choices`);
            if(voteChoicesListener) choicesRef.off('value', voteChoicesListener);
            
            voteChoicesListener = choicesRef.on('value', (snapshot) => {
                const choices = snapshot.val() || {};
                renderVoteResults(choices, secretVoteWeights);
            });
        });
    }

    function handleEndVote() {
        if (!currentRoomId) return;
        database.ref(`rooms/${currentRoomId}/votingState/status`).once('value', (snapshot) => {
            if (snapshot.val() === 'active') {
                database.ref(`rooms/${currentRoomId}/votingState/status`).set('finished');
            }
        });

        const choicesRef = database.ref(`rooms/${currentRoomId}/votingState/choices`);
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
        
        startVoteNowBtn.style.display = 'inline-block';
        endVoteNowBtn.style.display = 'none';
    }

    function renderVoteResults(choices, weights) {
        if (!voteResultsContainer || !roomData.players) return;

        const livingPlayers = Object.entries(roomData.players).filter(([,p]) => p.isAlive);
        let detailsHtml = '<h4>Chi tiết:</h4><ul>';
        
        livingPlayers.sort(([,a],[,b]) => a.name.localeCompare(b.name)).forEach(([voterId, voter]) => {
            const choice = choices ? choices[voter.name] : null;
            let targetName;
            if (choice === 'skip_vote') {
                targetName = 'Bỏ qua';
            } else if (choice) {
                targetName = roomData.players[choice]?.name || 'Không rõ';
            } else {
                targetName = '<em style="opacity: 0.7">Chưa bỏ phiếu</em>';
            }
            const weight = weights[voterId] || 0;
            detailsHtml += `<li><strong>${voter.name}</strong> (x${weight}) → <strong>${targetName}</strong></li>`;
        });
        detailsHtml += '</ul>';
        voteResultsContainer.querySelector('#vote-results-details').innerHTML = detailsHtml;

        const tally = {};
        livingPlayers.forEach(([id]) => tally[id] = 0);
        tally['skip_vote'] = 0;
        
        livingPlayers.forEach(([voterId, voter]) => {
            const choice = choices ? choices[voter.name] : null;
            const weight = weights[voterId] || 0;
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
            const targetName = targetId === 'skip_vote' ? 'Bỏ qua' : (roomData.players[targetId]?.name || 'Không rõ');
            summaryHtml += `<li ${isMostVoted ? 'class="most-voted"' : ''}>${targetName}: <strong>${count}</strong> phiếu</li>`;
        });
        summaryHtml += '</ul>';
        voteResultsContainer.querySelector('#vote-results-summary').innerHTML = summaryHtml;
    }

    function attachVoteButtonListeners() {
        startVoteNowBtn.addEventListener('click', handleStartVote);
        endVoteNowBtn.addEventListener('click', handleEndVote);
        
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
    }

    // =================================================================
    // === HÀM MỚI CHO TÍNH NĂNG THU GỌN ===
    // =================================================================
    function initializeCollapsibleSections() {
        const headers = document.querySelectorAll('.card-header-collapsible');
        headers.forEach(header => {
            // Mặc định thu gọn 2 mục cuối
            if(header.parentElement.id === 'players-card' || header.parentElement.id === 'log-card') {
                header.classList.add('collapsed');
                header.nextElementSibling.classList.add('collapsed');
            }

            header.addEventListener('click', () => {
                header.classList.toggle('collapsed');
                const content = header.nextElementSibling;
                content.classList.toggle('collapsed');
            });
        });
    }

    initialize();
});