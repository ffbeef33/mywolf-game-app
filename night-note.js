document.addEventListener('DOMContentLoaded', () => {
    // --- Firebase Configuration (Moved to top level) ---
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
    const calculateNightStatus = (nightState) => {
        const statuses = {};
        const finalStatus = JSON.parse(JSON.stringify(nightState.playersStatus));
        const alivePlayerIds = Object.keys(finalStatus).filter(pId => finalStatus[pId].isAlive);

        alivePlayerIds.forEach(pId => {
            statuses[pId] = { damage: 0, isProtected: false, isHealed: false, hasArmor: false, isInDanger: false, isDead: false };
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

        let deadPlayerNames = [];
        alivePlayerIds.forEach(pId => {
            const playerStatus = statuses[pId];
            if (playerStatus.damage > 0 && !playerStatus.isProtected) {
                playerStatus.isInDanger = true;
            }

            let finalDamage = playerStatus.damage;
            if (playerStatus.isProtected) finalDamage = 0;
            if (playerStatus.hasArmor && finalDamage > 0) finalDamage--;
            
            if (finalDamage > 0 && !playerStatus.isHealed) {
                playerStatus.isDead = true;
                finalStatus[pId].isAlive = false;
                const playerData = roomPlayers.find(p => p.id === pId);
                if (playerData) deadPlayerNames.push(playerData.name);
            }
        });

        return { liveStatuses: statuses, finalStatus: finalStatus, deadPlayerNames };
    };
    
    // --- Rendering ---
    const render = () => {
        const nightState = nightStates[activeNightIndex];
        if (!nightState) {
            interactionTable.innerHTML = '<p>Hãy thêm một đêm để bắt đầu.</p>';
            return;
        }

        const { liveStatuses, deadPlayerNames } = calculateNightStatus(nightState);

        interactionTable.innerHTML = '';
        const allPlayers = [...roomPlayers].sort((a, b) => a.name.localeCompare(b.name));
        allPlayers.forEach(player => {
            const playerStatus = nightState.playersStatus[player.id];
            if (!playerStatus) return; // Bỏ qua nếu người chơi không có trong trạng thái đêm
            
            // Nếu người chơi đã chết từ đêm trước, hiển thị họ và không cần tính toán thêm
            if (!playerStatus.isAlive) {
                interactionTable.appendChild(createPlayerRow(player, playerStatus, null, nightState.isFinished));
            } else {
                interactionTable.appendChild(createPlayerRow(player, playerStatus, liveStatuses[player.id], nightState.isFinished));
            }
        });

        renderNightTabs();

        if (nightState.isFinished) {
            if (deadPlayerNames.length > 0) {
                nightResultsDiv.innerHTML = `<strong>Đã chết:</strong> ${deadPlayerNames.map(name => `<span class="dead-player">${name}</span>`).join(', ')}`;
            } else {
                nightResultsDiv.innerHTML = '<p>Không có ai chết trong đêm nay.</p>';
            }
        } else {
            nightResultsDiv.innerHTML = '<p>Đang chờ kết quả...</p>';
        }
    };

    const createPlayerRow = (player, playerStatus, liveStatus, isFinished) => {
        const row = document.createElement('div');
        row.className = 'player-row';
        row.dataset.playerId = player.id;

        if (!playerStatus.isAlive) row.classList.add('status-dead');
        if (liveStatus) {
            if (liveStatus.isInDanger) row.classList.add('status-danger');
            if (liveStatus.isProtected) row.classList.add('status-protected');
            if (isFinished && liveStatus.isDead) row.classList.add('status-dead-calculated');
        }

        const livingPlayers = roomPlayers.filter(p => {
            const currentNight = nightStates[activeNightIndex];
            return currentNight.playersStatus[p.id]?.isAlive;
        });

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
        const currentNight = nightStates[activeNightIndex];
        currentNight.actions.forEach(action => {
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
                ${playerStatus.isAlive && !isFinished ? actionControlsHTML : ''}
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
            tab.dataset.index = index;
            nightTabsContainer.appendChild(tab);
        });
    };

    // --- Event Handlers ---
    const handleEvents = (e) => {
        const target = e.target;
        const nightState = nightStates[activeNightIndex];

        // Night Tab Click
        if (target.closest('.night-tab')) {
            activeNightIndex = parseInt(target.closest('.night-tab').dataset.index, 10);
            render();
            return;
        }

        // Add Night Button
        if (target.closest('#add-night-btn')) {
            const lastNight = nightStates[nightStates.length - 1];
            if (lastNight && !lastNight.isFinished) {
                alert(`Vui lòng kết thúc Đêm ${nightStates.length} trước khi thêm đêm mới.`);
                return;
            }
            const { finalStatus } = lastNight ? calculateNightStatus(lastNight) : { finalStatus: null };
            const newPlayersStatus = finalStatus ? finalStatus : 
                Object.fromEntries(roomPlayers.map(p => [p.id, { isAlive: true }]));

            nightStates.push({ actions: [], playersStatus: newPlayersStatus, isFinished: false });
            activeNightIndex = nightStates.length - 1;
            render();
            return;
        }

        // Reset Night Button
        if (target.closest('#reset-night-btn')) {
            if (nightState && confirm(`Bạn có chắc muốn làm mới mọi hành động trong Đêm ${activeNightIndex + 1}?`)) {
                nightState.actions = [];
                nightState.isFinished = false;
                render();
            }
            return;
        }

        // End Night Button
        if (target.closest('#end-night-btn')) {
            if (nightState && !nightState.isFinished) {
                if (confirm(`Bạn có chắc muốn kết thúc Đêm ${activeNightIndex + 1}? Hành động này không thể hoàn tác.`)) {
                    nightState.isFinished = true;
                    render();
                }
            }
            return;
        }

        // Player Row Interactions
        const row = target.closest('.player-row');
        if (row) {
            const actorId = row.dataset.playerId;
            if (!nightState || nightState.isFinished) return;

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
                document.addEventListener('click', handleEvents);
                // Add the first night automatically
                const initialStatus = Object.fromEntries(roomPlayers.map(p => [p.id, { isAlive: true }]));
                nightStates.push({ actions: [], playersStatus: initialStatus, isFinished: false });
                render();
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