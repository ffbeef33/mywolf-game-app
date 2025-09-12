// =================================================================
// === interactive-gm.js - NÂNG CẤP LOG CHI TIẾT CHO QUẢN TRÒ ===
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
    let allNightQuestions = [];
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
        await fetchNightQuestions();
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
    
    const fetchNightQuestions = async () => {
        try {
            const response = await fetch(`/api/sheets?sheetName=Question`);
            if (response.ok) {
                const questions = await response.json();
                if (Array.isArray(questions) && questions.length > 0) {
                    allNightQuestions = questions;
                } else {
                    console.warn("Cảnh báo: Tải câu hỏi thành công nhưng danh sách trống hoặc sai định dạng. Sử dụng câu hỏi dự phòng.");
                    allNightQuestions = ["Bạn có tin tưởng vào quyết định của mình trong ngày hôm nay không?"];
                }
            } else {
                console.error("Lỗi: Không thể tải danh sách câu hỏi. Status:", response.status, ". Sử dụng câu hỏi dự phòng.");
                allNightQuestions = ["Bạn có tin tưởng vào quyết định của mình trong ngày hôm nay không?"];
            }
        } catch (error) {
            console.error("Lỗi nghiêm trọng khi tải câu hỏi:", error, ". Sử dụng câu hỏi dự phòng.");
            allNightQuestions = ["Bạn có tin tưởng vào quyết định của mình trong ngày hôm nay không?"];
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
            const actionLogsContainer = document.createElement('div');

            if (Object.keys(actions).length > 0) {
                for(const actorId in actions) {
                    const actionData = actions[actorId];
                    const logPrefix = actionData.by === 'gm' ? '<span class="gm-log-tag">[GM]</span> ' : '';

                    if (actorId === 'wolf_group') {
                        const wolfVotes = actionData.votes || {};
                        const wolfActionLabel = ALL_ACTIONS[actionData.action]?.label || actionData.action || 'Cắn';

                        for (const voterId in wolfVotes) {
                            const targetId = wolfVotes[voterId];
                            let voterName;
                            let wolfLogPrefix = '';
                            if (voterId.startsWith('GM_')) {
                                wolfLogPrefix = '<span class="gm-log-tag">[GM]</span> ';
                                const aLivingWolf = Object.values(roomData.players).find(p => p.isAlive && (p.currentFaction === 'Bầy Sói' || p.currentFaction === 'Phe Sói'));
                                voterName = aLivingWolf?.name || 'Bầy Sói';
                            } else {
                                voterName = roomData.players[voterId]?.name || 'Sói lạ';
                            }
                            
                            const targetName = roomData.players[targetId]?.name || 'Mục tiêu lạ';
                            const p = document.createElement('p');
                            p.className = 'log-action';
                            p.innerHTML = `${wolfLogPrefix}<strong>${voterName}</strong> đã vote <em>${wolfActionLabel}</em> <strong>${targetName}</strong>.`;
                            actionLogsContainer.appendChild(p);
                        }
                    } else {
                        let actorName;
                        let actorData;
                        let actorRole = '';
                        
                        if (actorId.startsWith('GM_ACTION_')) {
                            logPrefix = '<span class="gm-log-tag">[GM]</span> ';
                            actorName = 'Quản Trò';
                        } else {
                            actorData = roomData.players[actorId];
                            actorName = actorData?.name || 'Người chơi lạ';
                            actorRole = actorData?.roleName ? `<span class="player-role">(${actorData.roleName})</span>` : '';
                        }

                        const targetNames = (actionData.targets || []).filter(Boolean).map(targetId => roomData.players[targetId]?.name || 'Mục tiêu lạ').join(', ');
                        if (!targetNames) continue;
                        
                        let actionLabel = ALL_ACTIONS[actionData.action]?.label || actionData.action;
                        if(actionData.action === 'assassinate') actionLabel += ` (Đoán: ${actionData.guess})`;

                        const p = document.createElement('p');
                        p.className = 'log-action';
                        p.innerHTML = `${logPrefix}<strong>${actorName}</strong> ${actorRole} đã chọn <em>${actionLabel}</em> <strong>${targetNames}</strong>.`;
                        actionLogsContainer.appendChild(p);
                    }
                }
            } else if (i < currentNight || (i === currentNight && state.phase !== 'night')) {
                actionLogsContainer.innerHTML = '<p><em>Không có hành động nào được ghi nhận cho đêm này.</em></p>';
            }
            
            gameLog.appendChild(actionLogsContainer);

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
                         resultsHTML += `<p class="log-info"><i class="fas fa-info-circle"></i>${info}</p>`;
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
            const factionA = a.currentFaction || roleA.faction || 'Z';
            const factionB = b.currentFaction || roleB.faction || 'Z';
            return factionA.localeCompare(factionB) || a.name.localeCompare(b.name);
        });

        sortedPlayers.forEach(([id, player]) => {
            const roleName = player.roleName || 'Chưa có vai';
            const roleData = allRolesData[roleName] || {};
            const faction = player.currentFaction || roleData.faction || 'Khác';

            const card = document.createElement('div');
            card.className = 'interactive-player-card';
            card.classList.add(getFactionClass(faction));

            if (!player.isAlive) {
                card.classList.add('dead');
            }

            const statusIcon = player.isAlive 
                ? '<i class="fas fa-heart"></i>' 
                : '<i class="fas fa-heart-crack"></i>';

            let displayRole = roleName;
            if (player.originalRoleName) {
                displayRole = `${roleName} <em style="font-size: 0.8em; opacity: 0.8;">(Gốc: ${player.originalRoleName})</em>`;
            }

            card.innerHTML = `
                <div class="player-status">${statusIcon}</div>
                <p class="player-name" title="${player.name}">${player.name}</p>
                <p class="player-role">${displayRole}</p>
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
                    faction: player.currentFaction || roleInfo.faction || 'Chưa phân loại',
                    roleName: roleName,
                    kind: kind,
                    isDisabled: false, isPermanentlyDisabled: false, isPermanentlyProtected: false,
                    isPermanentlyNotified: false, hasPermanentKillAbility: false, hasPermanentCounterWard: false,
                    armor: (kind === 'armor1' ? 2 : 1),
                    delayKillAvailable: (kind === 'delaykill'),
                    isDoomed: false, deathLinkTarget: null, sacrificedBy: null,
                    transformedState: null, groupId: null, markedForDelayKill: false,
                    originalRoleName: player.originalRoleName || null,
                    activeRule: roleInfo.active || 'n',
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
                
                let actionToPerform = null;
                if (wolfAction === 'kill') {
                    actionToPerform = 'kill';
                } else if (wolfAction === 'curse') {
                    actionToPerform = 'curse';
                } else {
                    actionToPerform = 'kill'; // Mặc định là cắn nếu không có action
                }
            
                if (finalTargetId && actionToPerform) {
                    formattedActions.push({
                        id: actionIdCounter++,
                        actorId: 'wolf_group',
                        targets: [finalTargetId],
                        action: actionToPerform
                    });
                }
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
                faction: data.currentFaction || roleInfo.faction || 'Chưa phân loại',
                kind: roleInfo.kind || 'empty',
                activeRule: roleInfo.active || 'n',
                quantity: roleInfo.quantity || 1,
                duration: roleInfo.duration || '1'
            };
        });
        
        const results = calculateNightStatus(nightStateForCalc, roomPlayersForCalc);
        let { finalStatus, deadPlayerNames, infoResults, wizardSavedPlayerNames, loveRedirects, liveStatuses } = results;

        for (const action of formattedActions) {
            if (action.action === 'detect') {
                const detectorId = action.actorId;
                const detector = allPlayers[detectorId];
                const targetId = action.targets[0];
                const target = allPlayers[targetId];
        
                if (detector && target) {
                    const detectorWasDisabled = liveStatuses[detectorId] && liveStatuses[detectorId].isDisabled;
                    
                    let resultText = "Không phải chết do Sói cắn";
        
                    if (!detectorWasDisabled) {
                        const targetData = roomData.players[targetId];
                        if (targetData && targetData.causeOfDeath === 'wolf_bite') {
                            resultText = "Chết do Sói cắn";
                        }
                    }
        
                    const logMessage = `Bạn đã điều tra xác chết ${target.name} và kết quả là: ${resultText}`;
                    updates[`/nightResults/${currentNight}/private/${detectorId}`] = logMessage;
                }
            }
        }
        
        const detailedLog = [...(infoResults || [])]; 

        Object.keys(liveStatuses).forEach(pId => {
            const status = liveStatuses[pId];
            const player = allPlayers[pId];
            if (!player) return;
    
            if (status.isProtected && !detailedLog.some(log => log.includes(player.name) && log.includes("bảo vệ"))) {
                detailedLog.push(`- ${player.name} đã được bảo vệ trong đêm.`);
            }
            if (status.isSaved && !detailedLog.some(log => log.includes(player.name) && log.includes("cứu"))) {
                 detailedLog.push(`- ${player.name} đã được cứu sống.`);
            }
        });
        
        const curseAction = formattedActions.find(a => a.action === 'curse' && a.actorId === 'wolf_group');
        if (curseAction) {
            let targetId = curseAction.targets[0];
            
            const loverId = loveRedirects[targetId];
            if (loverId) {
                targetId = loverId;
            }

            const targetPlayer = allPlayers[targetId];
            if (targetPlayer && initialPlayerStatus[targetId]?.faction !== 'Bầy Sói') {
                updates[`/players/${targetId}/originalRoleName`] = targetPlayer.roleName;
                updates[`/players/${targetId}/roleName`] = 'Sói thường';
                updates[`/players/${targetId}/currentFaction`] = 'Bầy Sói';
                updates[`/interactiveState/curseAbility/status`] = 'used';

                updates[`/nightResults/${currentNight}/private/${targetId}`] = 'Bạn đã bị Nguyền rủa và bị biến thành Sói!';
                Object.entries(allPlayers).forEach(([pId, pData]) => {
                    const pRole = allRolesData[pData.roleName] || {};
                    const isWolf = pData.currentFaction === 'Bầy Sói' || pRole.faction === 'Bầy Sói' || pRole.faction === 'Phe Sói';
                    if (pId !== targetId && isWolf && initialPlayerStatus[pId]?.isAlive) {
                         updates[`/nightResults/${currentNight}/private/${pId}`] = `Bầy Sói đã nguyền thành công ${targetPlayer.name}.`;
                    }
                });

                detailedLog.push(`- Bầy Sói đã nguyền rủa ${targetPlayer.name}, biến họ thành Sói.`);
                
                deadPlayerNames = deadPlayerNames.filter(name => {
                    const deadPlayerEntry = Object.entries(allPlayers).find(([,p]) => p.name === name);
                    if (!deadPlayerEntry) return true;
                    const deadPlayerId = deadPlayerEntry[0];
                    return finalStatus[deadPlayerId]?.causeOfDeath !== 'wolf_bite';
                });
            }
        }

        updates[`/nightResults/${currentNight}/public`] = {
            deadPlayerNames: deadPlayerNames || [],
            log: detailedLog,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        };

        Object.keys(finalStatus).forEach(playerId => {
            const originalPlayerState = initialPlayerStatus[playerId];
            const finalPlayerState = finalStatus[playerId];
            if (originalPlayerState?.isAlive && !finalPlayerState.isAlive) {
                updates[`/players/${playerId}/isAlive`] = false;

                if (finalPlayerState.causeOfDeath) {
                    updates[`/players/${playerId}/causeOfDeath`] = finalPlayerState.causeOfDeath;
                }

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
                updates[`/players/${pId}/currentFaction`] = null;
                updates[`/players/${pId}/originalRoleName`] = null;
                updates[`/players/${pId}/causeOfDeath`] = null;
                updates[`/players/${pId}/will`] = null;
                updates[`/players/${pId}/wizardAbilityState`] = null;
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
        const updates = {};
        
        updates[`/interactiveState/phase`] = 'night';
        updates[`/interactiveState/currentNight`] = currentNightNumber;
        updates[`/interactiveState/message`] = `Đêm ${currentNightNumber} bắt đầu.`;

        const newNightlyQuestions = {};
        if (allNightQuestions.length > 0) {
            const players = roomData.players || {};
            const allNightActions = roomData.nightActions || {};

            Object.entries(players).forEach(([playerId, player]) => {
                if (!player.isAlive) return;

                const roleData = allRolesData[player.roleName] || {};
                let hasAvailableAction = false;

                const isBitePackMember = player.currentFaction === 'Bầy Sói' || roleData.faction === 'Bầy Sói';
                if (isBitePackMember) {
                    hasAvailableAction = true;
                }
                
                // === START: CẬP NHẬT LOGIC CHO WIZARD (VẤN ĐỀ 1) ===
                if (!hasAvailableAction) {
                    // Kiểm tra logic đặc biệt cho Wizard trước
                    if (roleData.kind === 'wizard') {
                        const wizardState = player.wizardAbilityState || 'save_available';
                        if (wizardState !== 'used') {
                            hasAvailableAction = true;
                        }
                    } 
                    // Logic chung cho các vai trò khác
                    else {
                        const kinds = (roleData.kind || '').split('_');
                        for (const kind of kinds) {
                            const actionInfo = KIND_TO_ACTION_MAP[kind];
                            if (actionInfo && kind !== 'empty') {
                                const activeRule = roleData.active;
                                const parts = activeRule.split('_');
                                const usesRule = parts[0];
                                const startNightRule = parts.length > 1 ? parseInt(parts[1], 10) : 1;

                                let isCurrentlyUsable = true;
                                if (currentNightNumber < startNightRule) {
                                    isCurrentlyUsable = false;
                                }

                                if (isCurrentlyUsable && usesRule !== 'n') {
                                    const useLimit = parseInt(usesRule, 10);
                                    if (!isNaN(useLimit)) {
                                        let timesUsed = 0;
                                        for (const night in allNightActions) {
                                            if (allNightActions[night][playerId]?.action === actionInfo.key) {
                                                timesUsed++;
                                            }
                                        }
                                        if (timesUsed >= useLimit) {
                                            isCurrentlyUsable = false;
                                        }
                                    }
                                }

                                if (isCurrentlyUsable) {
                                    hasAvailableAction = true;
                                    break; 
                                }
                            }
                        }
                    }
                }
                // === END: CẬP NHẬT LOGIC CHO WIZARD (VẤN ĐỀ 1) ===
                
                if (!hasAvailableAction) {
                     const randomQuestion = allNightQuestions[Math.floor(Math.random() * allNightQuestions.length)];
                     newNightlyQuestions[playerId] = {
                        questionText: randomQuestion
                    };
                }
            });
        }
        updates['/interactiveState/nightlyQuestions'] = newNightlyQuestions;
        
        if (!state.curseAbility) {
            updates['/interactiveState/curseAbility'] = { status: 'locked' };
        }
        
        database.ref(`rooms/${currentRoomId}`).update(updates);
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
            const roomRef = database.ref(`rooms/${currentRoomId}`);

            if (action === '1') {
                if (confirm(`Bạn có chắc muốn GIẾT ${playerName}?`)) {
                    const updates = {};
                    updates[`players/${playerId}/isAlive`] = false;

                    const killedPlayer = roomData.players[playerId];
                    const killedPlayerRole = allRolesData[killedPlayer.roleName] || {};
                    const isWolf = killedPlayer.currentFaction === 'Bầy Sói' || killedPlayerRole.faction === 'Bầy Sói' || killedPlayerRole.faction === 'Phe Sói';
                    const curseState = roomData.interactiveState?.curseAbility?.status || 'locked';

                    if (isWolf && curseState === 'locked') {
                        updates[`interactiveState/curseAbility/status`] = 'available';
                    }
                    roomRef.update(updates);
                }
            } else if (action === '2') {
                if (confirm(`Bạn có chắc muốn HỒI SINH ${playerName}?`)) {
                    roomRef.child(`players/${playerId}/isAlive`).set(true);
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
    
    async function handleStartVote() {
        if (!currentRoomId) return;

        const roomSnapshot = await database.ref(`rooms/${currentRoomId}`).once('value');
        const freshRoomData = roomSnapshot.val();
        
        const livingPlayers = Object.entries(freshRoomData.players).filter(([, p]) => p.isAlive);
        const nightActions = freshRoomData.nightActions?.[freshRoomData.interactiveState.currentNight] || {};
        const questionAnswers = freshRoomData.interactiveState?.nightlyQuestions || {};

        // === START: CẬP NHẬT LOGIC VOTE (VẤN ĐỀ 2) ===
        const eligibleVoterIds = livingPlayers.map(([playerId, player]) => {
            const wasGivenQuestion = questionAnswers.hasOwnProperty(playerId);

            if (wasGivenQuestion) {
                // Nếu được giao câu hỏi, PHẢI trả lời mới được vote
                const answeredQuestion = questionAnswers[playerId]?.answer;
                return answeredQuestion ? playerId : null;
            } else {
                // Nếu không được giao câu hỏi (vì có chức năng), LUÔN được vote
                return playerId;
            }
        }).filter(Boolean); // Lọc ra những giá trị null
        // === END: CẬP NHẬT LOGIC VOTE (VẤN ĐỀ 2) ===

        if (eligibleVoterIds.length === 0) {
            alert("Không có người chơi nào đủ điều kiện để bỏ phiếu.");
            return;
        }

        secretVoteWeights = {};
        const voteWeightDisplays = document.querySelectorAll('.vote-weight-display');
        voteWeightDisplays.forEach(display => {
            const playerId = display.id.replace('weight-display-', '');
            const weight = parseInt(display.textContent, 10);
            if (playerId && !isNaN(weight) && eligibleVoterIds.includes(playerId)) {
                secretVoteWeights[playerId] = weight;
            }
        });
        
        const candidates = eligibleVoterIds.reduce((acc, id) => {
            acc[id] = freshRoomData.players[id].name;
            return acc;
        }, {});

        const voters = eligibleVoterIds.reduce((acc, id) => {
            acc[id] = { name: freshRoomData.players[id].name, roleName: freshRoomData.players[id].roleName };
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
            voters: voters,
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

        if (voteChoicesListener) {
            database.ref(`rooms/${currentRoomId}/votingState/choices`).off('value', voteChoicesListener);
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

        const voteRef = database.ref(`rooms/${currentRoomId}`);
        voteRef.once('value').then(snapshot => {
            const roomData = snapshot.val();
            if (!roomData || !roomData.votingState || roomData.votingState.status === 'finished') {
                return;
            }

            const choices = roomData.votingState.choices || {};
            const voters = Object.entries(roomData.votingState.voters || {});
            const weights = secretVoteWeights;

            const tally = {};

            voters.forEach(([voterId, voterData]) => {
                const choice = choices[voterData.name];
                const weight = weights[voterId] || 1;
                
                if (choice && choice !== 'skip_vote') {
                    tally[choice] = (tally[choice] || 0) + weight;
                } else {
                    tally['skip_vote'] = (tally['skip_vote'] || 0) + weight;
                }
            });

            let maxVotes = 0;
            let mostVotedPlayerIds = [];

            for (const playerId in tally) {
                if (playerId !== 'skip_vote') {
                    if (tally[playerId] > maxVotes) {
                        maxVotes = tally[playerId];
                        mostVotedPlayerIds = [playerId];
                    } else if (tally[playerId] === maxVotes) {
                        mostVotedPlayerIds.push(playerId);
                    }
                }
            }
            
            const skipVoteCount = tally['skip_vote'] || 0;
            const updates = {};
            let announcementText = "";

            if (maxVotes > 0 && maxVotes > skipVoteCount) {
                const executedPlayerNames = mostVotedPlayerIds.map(id => roomData.players[id]?.name).join(', ');
                announcementText = `Kết quả biểu quyết: ${executedPlayerNames} đã bị treo cổ.`;
                mostVotedPlayerIds.forEach(id => {
                    updates[`/players/${id}/isAlive`] = false;
                });
            } else {
                announcementText = "Kết quả biểu quyết: Không có ai bị treo cổ do số phiếu không hợp lệ hoặc số phiếu Bỏ Qua cao hơn.";
            }

            updates['/votingState/status'] = 'finished';
            updates['/publicData/latestAnnouncement'] = {
                message: announcementText,
                timestamp: firebase.database.ServerValue.TIMESTAMP
            };

            voteRef.update(updates);
        });
    }

    function renderVoteResults(choices, weights) {
        if (!voteResultsContainer || !roomData.players) return;
        
        const voters = Object.entries(roomData.votingState?.voters || {});
        let detailsHtml = '<h4>Chi tiết:</h4><ul>';
        
        voters.sort(([,a],[,b]) => a.name.localeCompare(b.name)).forEach(([voterId, voter]) => {
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
        voters.forEach(([id]) => { 
            if(roomData.players[id]) tally[id] = 0; 
        });
        tally['skip_vote'] = 0;
        
        voters.forEach(([voterId, voter]) => {
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

    function initializeCollapsibleSections() {
        const headers = document.querySelectorAll('.card-header-collapsible');
        headers.forEach(header => {
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