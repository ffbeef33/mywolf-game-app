document.addEventListener('DOMContentLoaded', () => {
    // --- Firebase ---
    // Lấy cấu hình Firebase từ biến môi trường do Canvas cung cấp để tăng cường bảo mật.
    const firebaseConfig = typeof __firebase_config !== 'undefined'
        ? JSON.parse(__firebase_config)
        : {
            // Cấu hình dự phòng nếu bạn chạy code ở môi trường khác không có __firebase_config
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

    // --- Elements ---
    const roomIdDisplay = document.getElementById('room-id-display');
    const interactionTable = document.getElementById('player-interaction-table');
    const nightResultsDiv = document.getElementById('night-results');
    const nightTabsContainer = document.getElementById('night-tabs');
    const gmNoteArea = document.getElementById('gm-night-note');
    const gmNoteBtn = document.getElementById('save-gm-night-note-btn');
    const gmLogContent = document.getElementById('gm-log-content');
    const playerLogContent = document.getElementById('player-log-content');
    const resultsCard = document.querySelector('.results-card');
    const endNightBtn = document.getElementById('end-night-btn');
    const resetNightBtn = document.getElementById('reset-night-btn');
    
    const willModalGm = document.getElementById('will-modal-gm');
    const willModalGmTitle = document.getElementById('will-modal-gm-title');
    const willModalGmContent = document.getElementById('will-modal-gm-content');
    const willModalGmPublishBtn = document.getElementById('will-modal-gm-publish-btn');
    let currentPlayerIdForWill = null; 

    let votingSection, votePlayersList, startVoteBtn, endVoteBtn, voteResultsContainer, voteTimerInterval;
    let secretVoteWeights = {};
    let voteChoicesListener = null;
    let rememberedVoteWeights = {};

    let actionModal, currentActorInModal = null;
    let factionChangeModal = null;

    let groupModal, groupModalTitle, groupNameInput, groupModalPlayers, groupModalConfirmBtn, currentGroupEditingPlayerId;

    // --- Config ---
    const FACTION_GROUPS = [
        { display: 'Bầy Sói', factions: ['Bầy Sói'], className: 'faction-wolf' },
        { display: 'Phe Sói', factions: ['Phe Sói'], className: 'faction-wolf' },
        { display: 'Phe Dân', factions: ['Phe Dân'], className: 'faction-villager' },
        { display: 'Phe trung lập', factions: ['Phe trung lập'], className: 'faction-neutral' },
        { display: 'Khác', factions: ['Chức năng khác', 'Chưa phân loại'], className: 'faction-other' }
    ];
    const SELECTABLE_FACTIONS = [ "Bầy Sói", "Phe Sói", "Phe Dân", "Phe trung lập" ];
    
    // --- State ---
    let roomPlayers = [], allRolesData = {}, nightStates = [], activeNightIndex = 0, nextActionId = 0, roomId = null;
    let customPlayerOrder = [];
    let roomDataState = {};
    let isInteractiveMode = false;

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
                        name: roleName,
                        faction: (role.Faction || 'Chưa phân loại').trim(),
                        active: (role.Active || '0').trim(),
                        kind: (role.Kind || 'empty').trim(),
                        quantity: quantityValue,
                        duration: (role.Duration || '1').toString().trim().toLowerCase()
                    };
                }
                return acc;
            }, {});

        } catch (error) {
            console.error("Lỗi tải dữ liệu vai trò:", error);
            interactionTable.innerHTML = `<p style="color:red;">Lỗi: Không thể tải dữ liệu vai trò từ Google Sheet.</p>`;
        }
    };

    function saveNightNotes() {
        if (isInteractiveMode || !roomId) return;
        database.ref(`rooms/${roomId}/nightNotes`).set(nightStates);
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
    
    // --- Log Builder Functions ---
    function buildGmActionLog(nightState) {
        const gmActions = [];
        if (Array.isArray(nightState.factionChanges)) {
            nightState.factionChanges.forEach(change => {
                const player = roomPlayers.find(p => p.id === change.playerId);
                const name = player ? `<strong class="player-name">${player.name}</strong>` : "???";
                const effectTime = change.isImmediate ? " (hiệu lực ngay)" : "";
                gmActions.push(`Đã đổi phe của ${name} thành <strong class="faction-name">${change.newFaction}</strong>${effectTime}.`);
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
    const render = (nightStateToRender) => {
        if (!nightStateToRender) {
             interactionTable.innerHTML = '<div class="loading-spinner"></div><p style="text-align: center;">Đang chờ dữ liệu hoặc đêm chưa bắt đầu...</p>';
             return;
        }
        renderForManualMode(nightStateToRender);
    };
    
    // --- NEW: Helper to build a temporary nightState from live interactive data ---
    function buildLiveNightStateFromInteractiveData(liveRoomData) {
        const currentNight = liveRoomData.interactiveState?.currentNight;
        if (!currentNight) return null;

        const liveActions = liveRoomData.nightActions?.[currentNight] || {};
        const formattedActions = [];
        let actionIdCounter = 0;

        // Convert live actions object to array format
        for (const actorId in liveActions) {
            const actionData = liveActions[actorId];
            if (actorId === 'wolf_group') {
                const wolfVotes = actionData.votes || {};
                Object.entries(wolfVotes).forEach(([voterId, targetId]) => {
                    formattedActions.push({
                        id: actionIdCounter++,
                        actorId: voterId, // Important: use voterId for wolf actions
                        targetId: targetId, // Keep targetId for consistency
                        action: actionData.action || 'kill'
                    });
                });
            } else {
                 (actionData.targets || []).forEach(targetId => {
                    formattedActions.push({
                        id: actionIdCounter++,
                        actorId: actorId,
                        targetId: targetId,
                        action: actionData.action
                    });
                 });
            }
        }

        // Create a playerStatus object based on the current live player data
        const currentPlayersStatus = Object.fromEntries(
            roomPlayers.map(p => [p.id, { 
                ...p,
                isAlive: liveRoomData.players[p.id]?.isAlive || false,
                faction: liveRoomData.players[p.id]?.currentFaction || p.baseFaction
            }])
        );

        return {
            actions: formattedActions,
            playersStatus: currentPlayersStatus,
            initialPlayersStatus: JSON.parse(JSON.stringify(currentPlayersStatus)),
            isFinished: false, 
            gmNote: "Chế độ tương tác - Ghi chú tạm thời.",
            damageGroups: {},
            factionChanges: []
        };
    }
    
    function renderForManualMode(nightState) {
        interactionTable.innerHTML = '';

        roomPlayers.forEach(p => {
            const playerStatus = nightState.playersStatus[p.id];
            if (playerStatus) {
                p.faction = playerStatus.faction || p.baseFaction;
                if (playerStatus.originalRoleName || playerStatus.transformedState) {
                    p.roleName = playerStatus.roleName;
                    p.kind = playerStatus.kind;
                    p.activeRule = playerStatus.activeRule;
                    p.quantity = playerStatus.quantity;
                    p.duration = playerStatus.duration;
                }
            }
        });

        const { liveStatuses, infoResults, deadPlayerNames, finalStatus } = calculateNightStatus(nightState, roomPlayers);
        
        roomPlayers.forEach(p => {
            if(finalStatus[p.id]) {
                p.faction = finalStatus[p.id].faction;
            }
        });
        
        if (nightState.isFinished) {
            nightResultsDiv.innerHTML = deadPlayerNames.length > 0
                    ? `<strong>Đã chết:</strong> ${deadPlayerNames.map(name => `<span class="dead-player">${name}</span>`).join(', ')}`
                    : '<p>Không có ai chết trong đêm nay.</p>';
        } else {
            nightResultsDiv.innerHTML = deadPlayerNames.length > 0
                ? `<strong>Dự kiến chết:</strong> ${deadPlayerNames.map(name => `<span class="dead-player">${name}</span>`).join(', ')}`
                : '<p>Dự kiến không có ai chết trong đêm nay.</p>';
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
                const finalPlayerState = finalStatus[player.id] || playerState;
                if (playerState) {
                    playerListContainer.appendChild(createPlayerRow(player, finalPlayerState, lStatus, nightState.isFinished));
                }
            });

            wrapper.appendChild(playerListContainer);
            interactionTable.appendChild(wrapper);
        });
        
        initializeSortable();
        renderNightTabs();
        
        resultsCard.style.display = 'grid';
        if(votingSection) votingSection.style.display = 'block';
        renderVotingModule();
    }
    
    function createPlayerRow(player, playerState, liveStatus, isFinished) {
        const row = document.createElement('div');
        row.className = 'player-row';
        row.dataset.playerId = player.id;
        
        const wasAliveAtStart = roomDataState.players[player.id]?.isAlive;
    
        if (!wasAliveAtStart) {
            row.classList.add('status-dead');
        } else {
            if (liveStatus) {
                if (liveStatus.isProtected) row.classList.add('status-protected');
                if (liveStatus.isSaved) row.classList.add('status-saved');
                if (liveStatus.isDead) row.classList.add('status-danger');
                if (liveStatus.isDisabled) row.classList.add('status-disabled-by-ability');
            }
        }
    
        if (player.originalRoleName) row.classList.add('status-cursed');
    
        let actionDisplayHTML = buildActionList(player.id);
        
        let statusIconsHTML = '';
        if (liveStatus) {
            if (liveStatus.isProtected) statusIconsHTML += '<i class="fas fa-shield-alt icon-protected" title="Được bảo vệ"></i>';
            if (liveStatus.isSaved) statusIconsHTML += '<i class="fas fa-plus-square icon-saved" title="Được cứu"></i>';
            if (liveStatus.isDead) statusIconsHTML += '<i class="fas fa-skull-crossbones icon-danger" title="Dự kiến chết"></i>';
            if (liveStatus.isDisabled) statusIconsHTML += '<i class="fas fa-exclamation-triangle icon-disabled-by-ability" title="Bị vô hiệu hóa"></i>';
        }
    
        let roleDisplayName = player.roleName || 'Chưa có vai';
        if (player.originalRoleName) {
             roleDisplayName = `${player.originalRoleName} <span class="cursed-note">(thành Sói)</span>`;
        }
    
        const willButtonHTML = !player.isAlive ? `
            <button class="will-modal-btn" data-player-id="${player.id}">Di Chúc</button>
        ` : '';
    
        const isActionDisabled = isFinished || !wasAliveAtStart;

        row.innerHTML = `
            <div class="player-header">
                <div class="player-info">
                    <div class="player-name-wrapper">
                        <div class="player-name">${player.name}</div>
                    </div>
                    <div class="player-role">${roleDisplayName}</div>
                </div>
                <div class="player-controls">
                    <div class="status-icons">${statusIconsHTML}</div>
                    ${!isActionDisabled ? `<button class="action-modal-btn" data-player-id="${player.id}">Action</button>` : ''}
                    ${!isActionDisabled && !isInteractiveMode ? `<button class="action-modal-btn group-btn" data-player-id="${player.id}">Link</button>` : ''}
                    ${willButtonHTML}
                </div>
            </div>
            <div class="action-display-list">${actionDisplayHTML}</div>
        `;
        
        return row;
    }

    function createWolfGroupRow(nightState, isFinished) {
        const row = document.createElement('div');
        row.className = 'player-row';
        
        let actionDisplayHTML = buildActionList('wolf_group');

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
    
    function buildActionList(playerId) {
        let html = '';
        let playerActions = [];

        let currentNightState;
        if (isInteractiveMode) {
             currentNightState = buildLiveNightStateFromInteractiveData(roomDataState);
        } else {
            currentNightState = nightStates[activeNightIndex];
        }

        if (currentNightState && Array.isArray(currentNightState.actions)) {
            // Special handling for wolf group display
            if (playerId === 'wolf_group') {
                const wolfActions = currentNightState.actions.filter(action => {
                    const actor = roomPlayers.find(p => p.id === action.actorId);
                    return actor && (actor.faction === 'Bầy Sói' || actor.faction === 'Phe Sói');
                });
                playerActions = wolfActions;
            } else {
                playerActions = currentNightState.actions.filter(action => action.actorId === playerId);
            }
        }

        if (playerActions.length > 0){
            playerActions.forEach(action => {
                const target = roomPlayers.find(p => p.id === action.targetId);
                const actionConfig = ALL_ACTIONS[action.action];
                const actionLabel = actionConfig?.label || action.action;
                const actor = roomPlayers.find(p => p.id === action.actorId);
                let displayText = `<i class="fas fa-arrow-right"></i> ${actionLabel} <strong>${target?.name || ''}</strong>`;
                if(playerId === 'wolf_group' && actor) {
                    displayText = `<em>${actor.name}</em> → ${actionLabel} <strong>${target?.name || ''}</strong>`;
                }

                html += `<div class="action-display-item">
                            ${displayText}
                            <button class="remove-action-btn" data-action-id="${action.id}" data-actor-id="${action.actorId}" data-target-id="${action.targetId}" data-action="${action.action}">&times;</button>
                         </div>`;
            });
        }
        return html;
    }

    const renderNightTabs = () => {
        nightTabsContainer.innerHTML = '';
        if (isInteractiveMode) {
             const currentNight = roomDataState.interactiveState?.currentNight || 0;
             nightTabsContainer.innerHTML = `<h3><i class="fas fa-gamepad"></i> Chế độ Tương Tác (Đêm ${currentNight})</h3>`;
             return;
        }

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
    
    function handleEvents(e) {
        const target = e.target;
        if (target.matches('.will-modal-btn')) {
            const playerId = target.dataset.playerId;
            openGmWillModal(playerId);
            return;
        }
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
                    actor = { id: 'wolf_group', name: 'Bầy Sói', roleName: 'Hành động chung', kind: 'kill', quantity: Infinity, activeRule: 'n', duration: '1' };
                } else if (wolfAction === 'curse') {
                    actor = { id: 'wolf_group', name: 'Bầy Sói', roleName: 'Hành động chung', kind: 'curse', quantity: 1, activeRule: 'n', duration: '1' };
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
            const actorId = target.dataset.actorId;
            const targetId = target.dataset.targetId;

            if (isInteractiveMode) {
                const currentNight = roomDataState.interactiveState.currentNight;
                const basePath = `rooms/${roomId}/nightActions/${currentNight}`;
                
                const actorPlayer = roomPlayers.find(p => p.id === actorId);
                const isWolf = actorPlayer && (actorPlayer.faction === 'Bầy Sói' || actorPlayer.faction === 'Phe Sói');

                if (isWolf) {
                    database.ref(`${basePath}/wolf_group/votes/${actorId}`).set(null);
                } else {
                    const actionRef = database.ref(`${basePath}/${actorId}`);
                    actionRef.once('value', snapshot => {
                        const actionData = snapshot.val();
                        if (actionData && actionData.targets) {
                            const newTargets = actionData.targets.filter(t => t !== targetId);
                            if (newTargets.length > 0) {
                                actionRef.child('targets').set(newTargets);
                            } else {
                                actionRef.set(null);
                            }
                        }
                    });
                }
            } else { 
                 const nightState = nightStates[activeNightIndex];
                 if (nightState && nightState.actions) {
                    nightState.actions = nightState.actions.filter(a => a.id !== actionId);
                    saveNightNotes();
                }
            }
            return;
        }
        
        // --- Actions below are disabled in interactive mode for this page ---
        if (isInteractiveMode) return;
        
        const nightState = nightStates[activeNightIndex];
        if (target.closest('.player-status-icon.life')) {
            const actorId = target.closest('.player-row').dataset.playerId;
             if (nightState && !nightState.isFinished) {
                 const newStatus = !nightState.playersStatus[actorId].isAlive;
                 nightState.playersStatus[actorId].isAlive = newStatus;
                 nightState.initialPlayersStatus[actorId].isAlive = newStatus;
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
            let prevStatus = lastNight ? calculateNightStatus(lastNight, roomPlayers).finalStatus : Object.fromEntries(roomPlayers.map(p => {
                return [p.id, { 
                    isAlive: p.isAlive, isDisabled: false, isPermanentlyDisabled: false, isPermanentlyProtected: false,
                    isPermanentlyNotified: false, hasPermanentKillAbility: false, hasPermanentCounterWard: false,
                    armor: (p.kind === 'armor1' ? 2 : 1), delayKillAvailable: (p.kind === 'delaykill'),
                    isDoomed: false, deathLinkTarget: null, sacrificedBy: null, transformedState: null,
                    markedForDelayKill: false, groupId: null, faction: p.faction, originalRoleName: null,
                    roleName: p.roleName, kind: p.kind, activeRule: p.activeRule, quantity: p.quantity,
                    duration: p.duration, isBoobyTrapped: false,
                }];
            }));
            if (lastNight && Array.isArray(lastNight.factionChanges)) {
                lastNight.factionChanges.forEach(change => {
                    if (prevStatus[change.playerId]) {
                        prevStatus[change.playerId].faction = change.newFaction;
                        if (change.originalRoleName && !prevStatus[change.playerId].originalRoleName) {
                            prevStatus[change.playerId].originalRoleName = change.originalRoleName;
                        }
                    }
                });
            }
            Object.keys(prevStatus).forEach(pId => {
                const playerStatus = prevStatus[pId];
                if (playerStatus && playerStatus.transformedState) {
                    if(!playerStatus.originalRoleName) {
                        playerStatus.originalRoleName = playerStatus.roleName; 
                    }
                    const newRoleData = allRolesData[playerStatus.transformedState.roleName];
                    if(newRoleData) {
                        playerStatus.roleName = newRoleData.name;
                        playerStatus.kind = newRoleData.kind;
                        playerStatus.activeRule = newRoleData.active;
                        playerStatus.quantity = newRoleData.quantity;
                        playerStatus.duration = newRoleData.duration;
                    }
                }
            });
            Object.keys(prevStatus).forEach(pId => {
                if(prevStatus[pId]) prevStatus[pId].isDisabled = false;
            });
            const initialStatusForNewNight = JSON.parse(JSON.stringify(prevStatus));
            nightStates.push({
                actions: [], playersStatus: initialStatusForNewNight,
                initialPlayersStatus: JSON.parse(JSON.stringify(initialStatusForNewNight)),
                isFinished: false, gmNote: "", damageGroups: lastNight ? (lastNight.damageGroups || {}) : {},
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
            render(nightStates[activeNightIndex]);
        } 
        else if (target.closest('#reset-night-btn')) {
            nightState.actions = [];
            nightState.isFinished = false;
            nightState.factionChanges = [];
            nightState.playersStatus = JSON.parse(JSON.stringify(nightState.initialPlayersStatus));
            recalculateAllPlayerFactions();
            nightState.damageGroups = {};
            saveNightNotes();
        } else if (target.closest('#end-night-btn')) {
            if (!nightState.isFinished) {
                const { loveRedirects, liveStatuses } = calculateNightStatus(nightState, roomPlayers);
                const curseActions = nightState.actions.filter(a => a.action === 'curse');
                const collectActions = nightState.actions.filter(a => a.action === 'collect');
                if (curseActions.length > 0 || collectActions.length > 0) {
                    if (!Array.isArray(nightState.factionChanges)) {
                        nightState.factionChanges = [];
                    }
                    curseActions.forEach(action => {
                        const originalTargetId = action.targetId;
                        const isWolfCurse = action.actorId === 'wolf_group';
                        if (isWolfCurse && liveStatuses[originalTargetId] && liveStatuses[originalTargetId].isImmuneToWolves) {
                            return; 
                        }
                        let finalTargetId = originalTargetId;
                        const loverId = loveRedirects[originalTargetId];
                        if(loverId && isWolfCurse) {
                            finalTargetId = loverId;
                        }
                        const targetPlayer = roomPlayers.find(p => p.id === finalTargetId);
                        if (targetPlayer && targetPlayer.faction !== 'Bầy Sói' && !nightState.factionChanges.some(fc => fc.playerId === finalTargetId)) {
                            nightState.factionChanges.push({
                                playerId: finalTargetId,
                                newFaction: 'Bầy Sói',
                                originalRoleName: targetPlayer.roleName
                            });
                        }
                    });
                    collectActions.forEach(action => {
                        const actor = roomPlayers.find(p => p.id === action.actorId);
                        const targetPlayer = roomPlayers.find(p => p.id === action.targetId);
                        if(actor && targetPlayer && !nightState.factionChanges.some(fc => fc.playerId === action.targetId)) {
                             nightState.factionChanges.push({
                                playerId: action.targetId,
                                newFaction: actor.faction,
                                originalRoleName: targetPlayer.roleName
                            });
                        }
                    });
                }
                nightState.isFinished = true;
                saveNightNotes();
            }
        }
    };
    
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
                    if (!cb.checked) cb.disabled = true;
                });
            } else {
                allCheckboxes.forEach(cb => {
                    cb.disabled = false;
                });
            }
        });
        
        actionModal.querySelector('#action-modal-confirm').addEventListener('click', () => {
            if (!currentActorInModal) return;
            
            const isWolfActor = currentActorInModal.id === 'wolf_group';
            const selectedActionButton = actionModal.querySelector('#action-modal-choices button.selected');
            const actionKey = selectedActionButton 
                ? selectedActionButton.dataset.actionKey
                : currentActorInModal.kind.split('_').map(k => KIND_TO_ACTION_MAP[k]?.key).filter(Boolean)[0];

            if (!actionKey) return;
            
            const checkedTargets = Array.from(actionModal.querySelectorAll('#action-modal-targets input:checked')).map(cb => cb.value);

            if (isInteractiveMode) {
                const currentNight = roomDataState.interactiveState.currentNight;
                const basePath = `rooms/${roomId}/nightActions/${currentNight}`;

                if (isWolfActor) {
                    const anyLivingWolf = roomPlayers.find(p => p.isAlive && (p.faction === 'Bầy Sói' || p.faction === 'Phe Sói'));
                    if (anyLivingWolf && checkedTargets.length > 0) {
                         const updates = {};
                         updates[`${basePath}/wolf_group/action`] = actionKey;
                         updates[`${basePath}/wolf_group/votes/${currentActorInModal.gmEditorId || anyLivingWolf.id}`] = checkedTargets[0];
                         database.ref().update(updates);
                    } else { // Remove vote
                         const anyLivingWolf = roomPlayers.find(p => p.isAlive && (p.faction === 'Bầy Sói' || p.faction === 'Phe Sói'));
                         if(currentActorInModal.gmEditorId || anyLivingWolf) {
                            database.ref(`${basePath}/wolf_group/votes/${currentActorInModal.gmEditorId || anyLivingWolf.id}`).set(null);
                         }
                    }
                } else {
                    const actionRef = database.ref(`${basePath}/${currentActorInModal.id}`);
                    if (checkedTargets.length > 0) {
                        // THÊM DẤU HIỆU 'by: gm' VÀO HÀNH ĐỘNG
                        actionRef.set({ 
                            action: actionKey, 
                            targets: checkedTargets,
                            by: 'gm' 
                        });
                    } else {
                        actionRef.set(null);
                    }
                }
            } else { // Manual mode
                 const nightState = nightStates[activeNightIndex];
                 let actionsToRemove = isWolfActor 
                    ? ['kill', 'curse']
                    : currentActorInModal.kind.split('_').map(k => KIND_TO_ACTION_MAP[k]?.key).filter(Boolean);
                
                 nightState.actions = nightState.actions.filter(a => 
                    !(a.actorId === currentActorInModal.id && actionsToRemove.includes(a.action))
                );

                 if (checkedTargets.length > 0) {
                    nightState.actions.push({
                        id: nextActionId++, actorId: currentActorInModal.id,
                        targetId: checkedTargets[0], // Assuming single target for simplicity here
                        action: actionKey
                    });
                }
                saveNightNotes();
            }

            actionModal.classList.add('hidden');
        });

        actionModal.querySelector('#action-modal-gm-overrides').addEventListener('click', e => {
             if (e.target.tagName !== 'BUTTON' || !currentActorInModal || isInteractiveMode) return;
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
            saveNightNotes();
        });
    }

    const initialize = async (_roomId) => {
        roomId = _roomId;
        roomIdDisplay.textContent = roomId;
        await fetchAllRolesData();
        createActionModal();
        createFactionChangeModal();
        createGroupModal();
        
        const roomRef = database.ref(`rooms/${roomId}`);
        roomRef.on('value', (snapshot) => {
            const roomData = snapshot.val();
            if(!roomData) return;
            
            roomDataState = roomData;
            isInteractiveMode = !!roomData.interactiveState && roomData.interactiveState.phase !== 'setup';
            
            // Disable/Enable buttons based on mode
            endNightBtn.disabled = isInteractiveMode;
            resetNightBtn.disabled = isInteractiveMode;
            gmNoteBtn.disabled = isInteractiveMode;
            if (document.getElementById('add-night-btn')) {
                document.getElementById('add-night-btn').style.display = isInteractiveMode ? 'none' : 'inline-flex';
            }
            
            const playersData = roomData.players || {};
            const basePlayers = Object.keys(playersData).map(key => {
                const originalData = playersData[key];
                const roleName = (originalData.roleName || '').trim();
                const roleInfo = allRolesData[roleName] || { faction: 'Chưa phân loại', active: '0', kind: 'empty', quantity: 1, duration: '1' };
                return { 
                    id: key, ...originalData, baseFaction: roleInfo.faction, faction: originalData.currentFaction || roleInfo.faction, 
                    activeRule: roleInfo.active, kind: roleInfo.kind, quantity: roleInfo.quantity,
                    duration: roleInfo.duration
                };
            });

            if (isInteractiveMode) {
                roomPlayers = basePlayers.map(p => ({
                    ...p,
                    faction: roomData.players[p.id]?.currentFaction || p.baseFaction
                }));
                const liveNightState = buildLiveNightStateFromInteractiveData(roomData);
                render(liveNightState);
            } else {
                 nightStates = roomData.nightNotes || [];
                 customPlayerOrder = roomData.playerOrder || [];
                 const finalFactions = {};
                 basePlayers.forEach(p => finalFactions[p.id] = p.baseFaction);
                 nightStates.forEach(night => {
                    if (Array.isArray(night.factionChanges)) {
                        night.factionChanges.forEach(change => {
                            finalFactions[change.playerId] = change.newFaction;
                        });
                    }
                });
                roomPlayers = basePlayers.map(p => ({ ...p, faction: finalFactions[p.id] || p.baseFaction }));

                if (roomPlayers.length > 0 && nightStates.length === 0) {
                     const initialStatus = Object.fromEntries(roomPlayers.map(p => {
                        return [p.id, { 
                            isAlive: p.isAlive, isDisabled: false, isPermanentlyDisabled: false,
                            isPermanentlyProtected: false, isPermanentlyNotified: false,
                            hasPermanentKillAbility: false, hasPermanentCounterWard: false,
                            armor: (p.kind === 'armor1' ? 2 : 1), delayKillAvailable: (p.kind === 'delaykill'),
                            isDoomed: false, deathLinkTarget: null, sacrificedBy: null,
                            transformedState: null, groupId: null, markedForDelayKill: false,
                            faction: p.faction, originalRoleName: null, roleName: p.roleName,
                            kind: p.kind, activeRule: p.activeRule, quantity: p.quantity,
                            duration: p.duration, isBoobyTrapped: false,
                        }];
                     }));
                     nightStates.push({
                        actions: [], playersStatus: initialStatus,
                        initialPlayersStatus: JSON.parse(JSON.stringify(initialStatus)),
                        isFinished: false, gmNote: "", damageGroups: {}, factionChanges: []
                    });
                    activeNightIndex = 0;
                    saveNightNotes();
                } else if (nightStates.length > 0) {
                    activeNightIndex = nightStates.length - 1;
                    nextActionId = Math.max(0, ...nightStates.flatMap(n => (n.actions || [])).map(a => a.id || 0)) + 1;
                    render(nightStates[activeNightIndex]);
                }
            }
        });

        document.removeEventListener('click', handleEvents); 
        document.addEventListener('click', handleEvents);
        gmNoteBtn.addEventListener('click', () => {
             if (nightStates[activeNightIndex] && !isInteractiveMode) {
                nightStates[activeNightIndex].gmNote = gmNoteArea.value;
                saveNightNotes();
                gmNoteBtn.textContent = "Đã lưu!";
                setTimeout(()=> gmNoteBtn.textContent = "Lưu Ghi Chú", 1500);
            }
        });
        
        if (willModalGm) {
            willModalGm.addEventListener('click', (e) => {
                if (e.target === willModalGm || e.target.classList.contains('close-modal-btn')) {
                    willModalGm.classList.add('hidden');
                }
            });
            willModalGmPublishBtn.addEventListener('click', publishWill);
        }
    };
    
    const urlRoomId = new URLSearchParams(window.location.search).get('roomId');
    if (urlRoomId) {
        initialize(urlRoomId);
    } else {
        document.body.innerHTML = '<h1>Lỗi: Không tìm thấy ID phòng trong URL.</h1>';
    }
    const openGmWillModal = (playerId) => {
        const player = roomPlayers.find(p => p.id === playerId);
        if (!player) return;
        currentPlayerIdForWill = playerId;
        willModalGmTitle.textContent = `Di Chúc của ${player.name}`;
        const willRef = database.ref(`rooms/${roomId}/players/${playerId}/will/content`);
        willRef.once('value', snapshot => {
            const willContent = snapshot.val();
            willModalGmContent.textContent = (willContent && willContent.trim() !== "") ? willContent : "Người chơi này chưa viết di chúc.";
            willModalGm.classList.remove('hidden');
        });
    };
    const publishWill = () => {
        if (!currentPlayerIdForWill) return;
        willModalGmPublishBtn.disabled = true;
        const player = roomPlayers.find(p => p.id === currentPlayerIdForWill);
        const willRef = database.ref(`rooms/${roomId}/players/${currentPlayerIdForWill}/will/content`);
        willRef.once('value', snapshot => {
            const content = snapshot.val() || "(Người này không để lại di chúc)";
            const publishedWillData = {
                playerName: player.name,
                content: content,
                timestamp: firebase.database.ServerValue.TIMESTAMP
            };
            database.ref(`rooms/${roomId}/publicData/publishedWill`).set(publishedWillData)
                .then(() => {
                    alert(`Đã công khai di chúc của ${player.name}`);
                    willModalGm.classList.add('hidden');
                })
                .catch(err => alert('Lỗi khi công khai di chúc: ' + err.message))
                .finally(() => willModalGmPublishBtn.disabled = false);
        });
    };
    function createGroupModal(){
        if(document.getElementById('group-modal-overlay')) return;
        groupModal = document.createElement('div');
        groupModal.id = 'group-modal-overlay';
        groupModal.className = 'modal-overlay hidden';
        groupModal.innerHTML = `
            <div class="modal-content group-modal">
                <span class="close-modal-btn">&times;</span>
                <h3 id="group-modal-title">Thiết lập nhóm</h3>
                <div class="form-group">
                    <label for="group-name-input">Tên nhóm (A, B, C...)</label>
                    <input type="text" id="group-name-input" placeholder="Nhập một chữ cái viết hoa">
                </div>
                <h4>Chọn thành viên</h4>
                <div id="group-modal-players" class="target-grid"></div>
                <div class="modal-buttons">
                    <button id="group-modal-confirm" class="btn-primary">Xác Nhận</button>
                </div>
            </div>
        `;
        document.body.appendChild(groupModal);
        
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
    function renderTargetsForSelectedAction() {
        if (!currentActorInModal) return;
        
        let livingPlayers;
        if (isInteractiveMode) {
            livingPlayers = roomPlayers.filter(p => roomDataState.players[p.id]?.isAlive);
        } else {
            const nightState = nightStates[activeNightIndex];
            livingPlayers = roomPlayers.filter(p => nightState.playersStatus[p.id]?.isAlive);
        }

        const playerActionTitle = actionModal.querySelector('#player-action-section-title');
        const targetsContainer = actionModal.querySelector('#action-modal-targets');
        const selectedActionButton = actionModal.querySelector('#action-modal-choices button.selected');
        const actionKey = selectedActionButton 
            ? selectedActionButton.dataset.actionKey
            : currentActorInModal.kind.split('_').map(k => KIND_TO_ACTION_MAP[k]?.key).filter(Boolean)[0];
        
        if (!actionKey) {
            targetsContainer.innerHTML = '<p>Hành động không hợp lệ.</p>';
            return;
        }

        const actionConfig = ALL_ACTIONS[actionKey];
        playerActionTitle.textContent = `Chọn mục tiêu cho "${actionConfig.label}"`;
        targetsContainer.innerHTML = '';

        let currentTargetIds = new Set();
        if (isInteractiveMode) {
            const currentNight = roomDataState.interactiveState.currentNight;
            const liveActions = roomDataState.nightActions?.[currentNight] || {};
            
            if (currentActorInModal.id === 'wolf_group') {
                const gmVote = liveActions.wolf_group?.votes?.[currentActorInModal.gmEditorId];
                if(gmVote) currentTargetIds.add(gmVote);
            } else {
                const actionData = liveActions[currentActorInModal.id];
                 if (actionData && actionData.targets) {
                    actionData.targets.forEach(t => currentTargetIds.add(t));
                }
            }
        } else {
            const currentActions = (nightStates[activeNightIndex].actions || []).filter(a => a.actorId === currentActorInModal.id && a.action === actionKey);
            if (currentActions.length > 0) {
                 currentTargetIds = new Set(currentActions[0].targets);
            }
        }

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
                allCheckboxes.forEach(cb => { if (!cb.checked) cb.disabled = true; });
            }
        }
    }
    function openActionModal(actor) {
        currentActorInModal = actor;
        if (isInteractiveMode && actor.id === 'wolf_group') {
             currentActorInModal.gmEditorId = `GM_${Math.random().toString(36).substr(2, 5)}`;
        }
        
        const actionModalTitle = actionModal.querySelector('#action-modal-title');
        const actionSelectionSection = actionModal.querySelector('#action-selection-section');
        const actionChoicesContainer = actionModal.querySelector('#action-modal-choices');
        const playerActionSection = actionModal.querySelector('#player-action-section');
        const gmOverrideSection = actionModal.querySelector('#gm-override-section');
        
        actionModalTitle.textContent = `Hành động: ${actor.name} (${actor.roleName})`;
        gmOverrideSection.style.display = isInteractiveMode ? 'none' : 'block';
        
        const isWolfGroup = actor.id === 'wolf_group';
        const possibleKinds = isWolfGroup ? [actor.kind] : (actor.kind || '').split('_');
        const allPossibleActions = possibleKinds.map(k => KIND_TO_ACTION_MAP[k]).filter(Boolean);
        actionChoicesContainer.innerHTML = '';
        
        let availableActions = allPossibleActions;
        if (!isInteractiveMode) {
             availableActions = allPossibleActions.filter(action => isActionCurrentlyAvailable(actor, action.key, activeNightIndex));
        }

        if (allPossibleActions.length > 1) {
            actionSelectionSection.style.display = 'block';
            allPossibleActions.forEach(action => {
                const btn = document.createElement('button');
                btn.textContent = action.label;
                btn.dataset.actionKey = action.key;
                if (action.type) btn.classList.add(`action-type-${action.type}`);
                if (!availableActions.some(a => a.key === action.key)) {
                    btn.disabled = true;
                    btn.title = "Không có sẵn hoặc đã sử dụng";
                }
                actionChoicesContainer.appendChild(btn);
            });
            const firstAvailableBtn = Array.from(actionChoicesContainer.children).find(btn => !btn.disabled);
            if(firstAvailableBtn) firstAvailableBtn.classList.add('selected');

        } else {
            actionSelectionSection.style.display = 'none';
        }
        
        if (availableActions.length > 0) {
            playerActionSection.style.display = 'block';
            renderTargetsForSelectedAction();
        } else {
            playerActionSection.style.display = 'none';
        }
        
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
                nightState.factionChanges.push({ playerId: targetId, newFaction: newFaction, isImmediate: true });
                saveNightNotes();
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
    function createVotingModuleStructure() {
        if (document.getElementById('voting-section')) {
            votingSection = document.getElementById('voting-section');
            votePlayersList = votingSection.querySelector('#vote-players-list');
            voteResultsContainer = votingSection.querySelector('#vote-results-container');
            startVoteBtn = votingSection.querySelector('#start-vote-btn');
            endVoteBtn = votingSection.querySelector('#end-vote-btn');
            startVoteBtn.addEventListener('click', handleStartVote);
            endVoteBtn.addEventListener('click', handleEndVote);
            return;
        };
        const mainContainer = document.querySelector('.container');
        const logSection = document.getElementById('night-logs-section');
        const votingModuleEl = document.createElement('div');
        votingModuleEl.id = 'voting-section';
        votingModuleEl.className = 'card';
        votingModuleEl.innerHTML = `...`; // Giữ nguyên
        if (logSection) {
            logSection.parentNode.insertBefore(votingModuleEl, logSection.nextSibling);
        } else {
             mainContainer.appendChild(votingModuleEl);
        }
    }
    function renderVotingModule() {
        if(!votingSection) createVotingModuleStructure();
        const lastNight = nightStates[nightStates.length - 1];
        if (!lastNight || !votePlayersList) return;
        const { finalStatus } = calculateNightStatus(lastNight, roomPlayers);
        const livingPlayers = roomPlayers.filter(p => finalStatus[p.id]?.isAlive);
        votePlayersList.innerHTML = '<h4>Thiết lập phiếu vote:</h4>';
        if (livingPlayers.length > 0) {
            livingPlayers.sort((a,b) => a.name.localeCompare(b.name)).forEach(player => {
                const playerRow = document.createElement('div');
                playerRow.className = 'vote-player-row';
                const currentWeight = rememberedVoteWeights[player.id] ?? 1;
                playerRow.innerHTML = `...`; // Giữ nguyên
                votePlayersList.appendChild(playerRow);
            });
        } else {
            votePlayersList.innerHTML += '<p>Không có người chơi nào còn sống để vote.</p>';
        }
    }
    function handleStartVote() {
        if (!roomId) return;
        secretVoteWeights = {};
        document.querySelectorAll('.vote-weight-display').forEach(display => {
            const playerId = display.id.replace('weight-display-', '');
            const weight = parseInt(display.textContent, 10);
            if (playerId && !isNaN(weight)) secretVoteWeights[playerId] = weight;
        });
        const { finalStatus } = calculateNightStatus(nightStates[nightStates.length - 1], roomPlayers);
        const livingPlayers = roomPlayers.filter(p => finalStatus[p.id]?.isAlive);
        const candidates = livingPlayers.reduce((acc, p) => { acc[p.id] = p.name; return acc; }, {});
        const title = document.getElementById('vote-title-input').value || 'Vote';
        const timerSeconds = parseInt(document.getElementById('vote-timer-input').value, 10) || 60;
        const endTime = Date.now() + (timerSeconds * 1000);
        const votingState = { status: 'active', title, endTime, candidates, choices: null };
        database.ref(`rooms/${roomId}/votingState`).set(votingState).then(() => {
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
                renderVoteResults(snapshot.val() || {}, secretVoteWeights);
            });
        });
    }
    function handleEndVote() {
        if (!roomId) return;
        database.ref(`rooms/${roomId}/votingState/status`).once('value', (snapshot) => {
            if (snapshot.val() === 'active') {
                database.ref(`rooms/${roomId}/votingState/status`).set('finished');
            }
        });
        if (voteChoicesListener) {
            database.ref(`rooms/${roomId}/votingState/choices`).off('value', voteChoicesListener);
            voteChoicesListener = null;
        }
        if (voteTimerInterval) clearInterval(voteTimerInterval);
        const gmTimerDisplay = document.getElementById('gm-vote-timer-display');
        if (gmTimerDisplay) gmTimerDisplay.style.display = 'none';
        startVoteBtn.style.display = 'inline-block';
        endVoteBtn.style.display = 'none';
    }
    function renderVoteResults(choices, weights) {
        if (!voteResultsContainer) return;
        const { finalStatus } = calculateNightStatus(nightStates[nightStates.length - 1], roomPlayers);
        const livingPlayers = roomPlayers.filter(p => finalStatus[p.id]?.isAlive);
        let detailsHtml = '<h4>Chi tiết:</h4><ul>';
        livingPlayers.sort((a,b) => a.name.localeCompare(b.name)).forEach(voter => {
            const choice = choices ? choices[voter.name] : null;
            let targetName = '<em style="opacity: 0.7">Chưa bỏ phiếu</em>';
            if (choice === 'skip_vote') targetName = 'Bỏ qua';
            else if (choice) targetName = roomPlayers.find(p => p.id === choice)?.name || 'Không rõ';
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
            } else if (tally.hasOwnProperty(choice)) {
                tally[choice] += weight;
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
        Object.entries(tally).sort(([,a],[,b]) => b-a).forEach(([targetId, count]) => {
            const isMostVoted = mostVotedPlayers.includes(targetId) && count > 0;
            const targetName = targetId === 'skip_vote' ? 'Bỏ qua' : (roomPlayers.find(p => p.id === targetId)?.name || 'Không rõ');
            summaryHtml += `<li ${isMostVoted ? 'class="most-voted"' : ''}>${targetName}: <strong>${count}</strong> phiếu</li>`;
        });
        summaryHtml += '</ul>';
        voteResultsContainer.querySelector('#vote-results-summary').innerHTML = summaryHtml;
    }
});