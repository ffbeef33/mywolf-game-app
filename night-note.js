document.addEventListener('DOMContentLoaded', () => {
    // --- Elements ---
    const roomIdDisplay = document.getElementById('room-id-display');
    const interactionTable = document.getElementById('player-interaction-table');
    const nightResultsDiv = document.getElementById('night-results');
    const nightTabsContainer = document.getElementById('night-tabs');
    const addNightBtn = document.getElementById('add-night-btn');
    const resetNightBtn = document.getElementById('reset-night-btn');
    const endNightBtn = document.getElementById('end-night-btn');

    // --- Config ---
    const ACTIONS_CONFIG = {
        'wolf_bite': { label: 'Sói cắn', type: 'damage' },
        'wolf_dmg': { label: 'ST Sói', type: 'damage' },
        'villager_dmg': { label: 'ST Dân', type: 'damage' },
        'other_dmg': { label: 'ST Khác', type: 'damage' },
        'protect': { label: 'Bảo vệ', type: 'defense' },
        'save': { label: 'Cứu', type: 'defense' },
        'armor': { label: 'Giáp', type: 'defense' },
    };

    // --- State ---
    let roomPlayers = [];
    let nightStates = [];
    let activeNightIndex = 0;
    let nextActionId = 0;

    // --- Logic ---
    const calculateLiveStatuses = (nightState) => {
        const statuses = {};
        const alivePlayerIds = Object.keys(nightState.playersStatus).filter(pId => nightState.playersStatus[pId].isAlive);

        alivePlayerIds.forEach(pId => {
            statuses[pId] = { damage: 0, isProtected: false, isHealed: false, hasArmor: false, isInDanger: false };
        });

        nightState.actions.forEach(({ action, targetId }) => {
            if (!statuses[targetId]) return;
            const config = ACTIONS_CONFIG[action];
            if (config.type === 'damage') statuses[targetId].damage++;
            else if (config.type === 'defense') {
                if (action === 'protect') statuses[targetId].isProtected = true;
                if (action === 'save') statuses[targetId].isHealed = true;
                if (action === 'armor') statuses[targetId].hasArmor = true;
            }
        });

        alivePlayerIds.forEach(pId => {
            const playerStatus = statuses[pId];
            if (playerStatus.damage > 0 && !playerStatus.isProtected) {
                playerStatus.isInDanger = true;
            }
        });
        return statuses;
    };

    const calculateFinalResults = (nightState, liveStatuses) => {
        let deadPlayerNames = [];
        let finalPlayerStatus = JSON.parse(JSON.stringify(nightState.playersStatus));

        Object.keys(liveStatuses).forEach(pId => {
            const playerStatus = liveStatuses[pId];
            let finalDamage = playerStatus.damage;

            if (playerStatus.isProtected) finalDamage = 0;
            if (playerStatus.hasArmor && finalDamage > 0) finalDamage--;

            if (finalDamage > 0 && !playerStatus.isHealed) {
                finalPlayerStatus[pId].isAlive = false;
                const playerData = roomPlayers.find(p => p.id === pId);
                if (playerData) deadPlayerNames.push(playerData.name);
            }
        });
        return { deadPlayerNames, finalPlayerStatus };
    };

    const createNewNightState = () => {
        const lastNight = nightStates.length > 0 ? nightStates[nightStates.length - 1] : null;
        const playersStatus = {};
        if (lastNight) {
            const liveStatuses = calculateLiveStatuses(lastNight);
            const { finalPlayerStatus } = calculateFinalResults(lastNight, liveStatuses);
            Object.keys(lastNight.playersStatus).forEach(pId => {
                playersStatus[pId] = { isAlive: finalPlayerStatus[pId].isAlive };
            });
        } else {
            roomPlayers.forEach(p => { playersStatus[p.id] = { isAlive: true }; });
        }
        return { actions: [], playersStatus: playersStatus, isFinished: false };
    };

    // --- Rendering ---
    const render = () => {
        const nightState = nightStates[activeNightIndex];
        if (!nightState) return;

        const liveStatuses = calculateLiveStatuses(nightState);

        interactionTable.innerHTML = '';
        const allPlayers = [...roomPlayers].sort((a, b) => a.name.localeCompare(b.name));
        allPlayers.forEach(player => {
            interactionTable.appendChild(createPlayerRow(player, nightState, liveStatuses));
        });

        renderNightTabs();

        if (nightState.isFinished) {
            const { deadPlayerNames } = calculateFinalResults(nightState, liveStatuses);
            if (deadPlayerNames.length > 0) {
                nightResultsDiv.innerHTML = `<strong>Đã chết:</strong> ${deadPlayerNames.map(name => `<span class="dead-player">${name}</span>`).join(', ')}`;
            } else {
                nightResultsDiv.innerHTML = '<p>Không có ai chết trong đêm nay.</p>';
            }
        } else {
            nightResultsDiv.innerHTML = '<p>Đang chờ kết quả...</p>';
        }
    };

    const createPlayerRow = (player, nightState, liveStatuses) => {
        const row = document.createElement('div');
        row.className = 'player-row';
        row.dataset.playerId = player.id;

        const playerStatus = nightState.playersStatus[player.id];
        const playerLiveStatus = liveStatuses[player.id];

        if (!playerStatus.isAlive) row.classList.add('status-dead');
        if (playerLiveStatus) {
            if (playerLiveStatus.isInDanger) row.classList.add('status-danger');
            if (playerLiveStatus.isProtected) row.classList.add('status-protected');
        }

        const livingPlayers = roomPlayers.filter(p => nightState.playersStatus[p.id]?.isAlive);
        const actionControlsHTML = `
            <div class="action-controls">
                <select class="action-select">
                    <option value="">-- Chọn hành động --</option>
                    ${Object.entries(ACTIONS_CONFIG).map(([key, {label}]) => `<option value="${key}">${label}</option>`).join('')}
                </select>
                <select class="target-select">
                    <option value="">-- Chọn mục tiêu --</option>
                    ${livingPlayers.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                </select>
                <button class="add-action-btn" title="Thêm hành động"><i class="fas fa-plus"></i></button>
            </div>`;

        let actionListHTML = '<div class="action-list">';
        nightState.actions.forEach(action => {
            if (action.actorId === player.id) {
                const target = roomPlayers.find(p => p.id === action.targetId);
                actionListHTML += `
                    <div class="action-item" data-action-id="${action.id}">
                        <i class="fas fa-arrow-right"></i>
                        <span class="action-type-${ACTIONS_CONFIG[action.action].type}">${ACTIONS_CONFIG[action.action].label}</span>
                        <span class="target-name">${target?.name || 'Không rõ'}</span>
                        <button class="remove-action-btn" title="Xóa">&times;</button>
                    </div>`;
            }
        });
        actionListHTML += '</div>';

        row.innerHTML = `
            <div class="player-header">
                <div class="player-info">
                    <div class="player-name">${player.name}</div>
                    <div class="player-role">${player.roleName || 'Chưa có vai'}</div>
                </div>
                <div class="player-status-controls">
                    <button class="status-btn life ${playerStatus.isAlive ? 'alive' : 'dead'}" title="Sống/Chết"><i class="fas fa-heart"></i></button>
                </div>
                ${playerStatus.isAlive && !nightState.isFinished ? actionControlsHTML : ''}
            </div>
            ${actionListHTML}`;
        return row;
    };

    const renderNightTabs = () => {
        nightTabsContainer.innerHTML = '';
        nightStates.forEach((_, index) => {
            const tab = document.createElement('button');
            tab.className = 'night-tab';
            if (index === activeNightIndex) tab.classList.add('active');
            tab.textContent = `Đêm ${index + 1}`;
            tab.addEventListener('click', () => {
                activeNightIndex = index;
                render();
            });
            nightTabsContainer.appendChild(tab);
        });
    };

    // --- Event Handlers ---
    const handleTableClick = (e) => {
        const target = e.target;
        const row = target.closest('.player-row');
        if (!row) return;

        const actorId = row.dataset.playerId;
        const nightState = nightStates[activeNightIndex];
        if (nightState.isFinished) return;

        if (target.closest('.add-action-btn')) {
            const action = row.querySelector('.action-select').value;
            const targetId = row.querySelector('.target-select').value;
            if (action && targetId) {
                nightState.actions.push({ id: nextActionId++, actorId, action, targetId });
                render();
            }
        } else if (target.closest('.remove-action-btn')) {
            const actionId = parseInt(target.closest('.action-item').dataset.actionId, 10);
            const index = nightState.actions.findIndex(a => a.id === actionId);
            if (index > -1) {
                nightState.actions.splice(index, 1);
                render();
            }
        } else if (target.closest('.status-btn.life')) {
            nightState.playersStatus[actorId].isAlive = !nightState.playersStatus[actorId].isAlive;
            render();
        }
    };

    const handleEndNight = () => {
        const nightState = nightStates[activeNightIndex];
        if (nightState && !nightState.isFinished) {
            if (confirm(`Bạn có chắc muốn kết thúc Đêm ${activeNightIndex + 1}? Hành động này không thể hoàn tác.`)) {
                nightState.isFinished = true;
                render();
            }
        }
    };

    const handleAddNight = () => {
        const newNight = createNewNightState();
        nightStates.push(newNight);
        activeNightIndex = nightStates.length - 1;
        render();
    };

    const handleResetNight = () => {
        const nightState = nightStates[activeNightIndex];
        if (nightState && confirm(`Bạn có chắc muốn làm mới mọi hành động trong Đêm ${activeNightIndex + 1}?`)) {
            nightState.actions = [];
            nightState.isFinished = false;
            render();
        }
    };

    // --- Initialization ---
    const initialize = (roomId) => {
        roomIdDisplay.textContent = roomId;
        const roomRef = database.ref(`rooms/${roomId}/players`);
        roomRef.once('value', (snapshot) => {
            const playersData = snapshot.val();
            if (playersData) {
                roomPlayers = Object.keys(playersData).map(key => ({ id: key, ...playersData[key] }));
                addNightBtn.addEventListener('click', handleAddNight);
                resetNightBtn.addEventListener('click', handleResetNight);
                endNightBtn.addEventListener('click', handleEndNight);
                interactionTable.addEventListener('click', handleTableClick);
                handleAddNight();
            } else {
                interactionTable.innerHTML = '<p>Không tìm thấy dữ liệu người chơi.</p>';
            }
        }, (error) => {
            console.error(error);
            interactionTable.innerHTML = '<p>Lỗi khi tải dữ liệu phòng.</p>';
        });
    };

    const roomId = new URLSearchParams(window.location.search).get('roomId');
    if (roomId) {
        initialize(roomId);
    } else {
        document.body.innerHTML = '<h1>Lỗi: Không tìm thấy ID phòng.</h1>';
    }
});