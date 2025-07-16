document.addEventListener('DOMContentLoaded', () => {
    // --- Firebase Configuration ---
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
    const interactionTable = document.getElementById('player-interaction-table');
    const nightResultsDiv = document.getElementById('night-results');
    const nightTabsContainer = document.getElementById('night-tabs');
    const addNightBtn = document.getElementById('add-night-btn');
    const resetNightBtn = document.getElementById('reset-night-btn');

    // --- Game Logic Configuration ---
    const UNIVERSAL_ACTIONS = {
        'wolf_bite': 'Sói cắn', 'wolf_dmg': 'ST Sói', 'villager_dmg': 'ST Dân',
        'other_dmg': 'ST Khác', 'protect': 'Bảo vệ', 'save': 'Cứu', 'armor': 'Giáp',
    };
    const ACTION_PROPERTIES = {
        'wolf_bite': { type: 'damage' }, 'wolf_dmg': { type: 'damage' }, 'villager_dmg': { type: 'damage' },
        'other_dmg': { type: 'damage' }, 'protect': { type: 'defense' }, 'save': { type: 'defense' },
        'armor': { type: 'defense' },
    };

    // --- State Management ---
    let currentRoomId = null;
    let roomPlayers = [];
    let nightStates = [];
    let activeNightIndex = 0;
    let nextActionId = 0; // SỬA LỖI: Biến để tạo ID duy nhất cho mỗi hành động

    // --- Core Functions ---
    const getRoomIdFromURL = () => new URLSearchParams(window.location.search).get('roomId');

    const createNewNightState = () => {
        const lastNightState = nightStates.length > 0 ? nightStates[nightStates.length - 1] : null;
        let playersStatus = {};
        if (lastNightState) {
            const lastNightResults = calculateNightResults(lastNightState);
            playersStatus = lastNightResults.finalStatus;
        } else {
            roomPlayers.forEach(p => { playersStatus[p.id] = { isAlive: true }; });
        }
        return { actions: [], playersStatus: playersStatus };
    };

    const calculateNightResults = (nightState) => {
        const tempStatus = {};
        const alivePlayerIds = Object.keys(nightState.playersStatus).filter(pId => nightState.playersStatus[pId].isAlive);
        alivePlayerIds.forEach(pId => {
            tempStatus[pId] = {
                damageSources: 0, isProtected: false, isHealed: false,
                hasArmor: false, isDead: false, isInDanger: false,
            };
        });
        nightState.actions.forEach(({ action, targetId }) => {
            if (!tempStatus[targetId]) return;
            const prop = ACTION_PROPERTIES[action];
            if (prop.type === 'damage') tempStatus[targetId].damageSources++;
            else if (prop.type === 'defense') {
                if (action === 'protect') tempStatus[targetId].isProtected = true;
                if (action === 'save') tempStatus[targetId].isHealed = true;
                if (action === 'armor') tempStatus[targetId].hasArmor = true;
            }
        });
        let finalStatus = JSON.parse(JSON.stringify(nightState.playersStatus));
        let deadPlayerNames = [];
        alivePlayerIds.forEach(pId => {
            const player = tempStatus[pId];
            let finalDamage = player.damageSources;
            if (finalDamage > 0) player.isInDanger = true;
            if (player.isProtected) finalDamage = 0;
            if (!player.isProtected && player.hasArmor && finalDamage > 0) finalDamage--;
            if (finalDamage > 0 && !player.isHealed) {
                player.isDead = true;
                finalStatus[pId].isAlive = false;
                const playerData = roomPlayers.find(p => p.id === pId);
                if (playerData) deadPlayerNames.push(playerData.name);
            }
        });
        return { deadPlayerNames, finalStatus, tempStatus };
    };

    const renderAndUpdate = () => {
        const nightState = nightStates[activeNightIndex];
        if (!nightState) return;
        const { deadPlayerNames, tempStatus } = calculateNightResults(nightState);
        interactionTable.innerHTML = '';
        const alivePlayers = roomPlayers.filter(p => nightState.playersStatus[p.id]?.isAlive);
        const deadPlayers = roomPlayers.filter(p => !nightState.playersStatus[p.id]?.isAlive);
        [...alivePlayers, ...deadPlayers].sort((a,b) => a.name.localeCompare(b.name)).forEach(player => {
            const playerRow = createPlayerRow(player, nightState);
            interactionTable.appendChild(playerRow);
        });
        document.querySelectorAll('.player-row').forEach(row => {
            const playerId = row.dataset.playerId;
            const playerCalcStatus = tempStatus[playerId];
            row.classList.remove('status-danger', 'status-dead-calculated');
            if (playerCalcStatus) {
                if (playerCalcStatus.isInDanger) row.classList.add('status-danger');
                if (playerCalcStatus.isDead) row.classList.add('status-dead-calculated');
            }
        });
        if (deadPlayerNames.length > 0) {
            nightResultsDiv.innerHTML = `<strong>Sẽ chết:</strong> ${deadPlayerNames.map(name => `<span class="dead-player">${name}</span>`).join(', ')}`;
        } else {
            nightResultsDiv.innerHTML = '<p>Chưa có ai chết...</p>';
        }
        document.querySelectorAll('.night-tab').forEach((tab, index) => {
            tab.classList.toggle('active', index === activeNightIndex);
        });
    };

    const createPlayerRow = (player, nightState) => {
        const row = document.createElement('div');
        row.className = 'player-row';
        row.dataset.playerId = player.id;
        const playerStatus = nightState.playersStatus[player.id];
        if (!playerStatus || !playerStatus.isAlive) row.classList.add('status-dead');
        const livingPlayers = roomPlayers.filter(p => nightState.playersStatus[p.id]?.isAlive);
        let headerHTML = `
            <div class="player-header">
                <div class="player-info">
                    <div class="player-name">${player.name}</div>
                    <div class="player-role">${player.roleName}</div>
                </div>
                <div class="player-status-controls">
                    <button class="status-btn life ${playerStatus?.isAlive ? 'active alive' : 'dead'}" title="Đánh dấu Sống/Chết"><i class="fas fa-heart"></i></button>
                </div>
                <div class="action-controls">
                    <select class="action-select">
                        <option value="">-- Chọn hành động --</option>
                        ${Object.entries(UNIVERSAL_ACTIONS).map(([key, label]) => `<option value="${key}">${label}</option>`).join('')}
                    </select>
                    <select class="target-select">
                        <option value="">-- Chọn mục tiêu --</option>
                        ${livingPlayers.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                    </select>
                    <button class="add-action-btn" title="Thêm hành động này"><i class="fas fa-plus"></i></button>
                </div>
            </div>`;
        let actionListHTML = '<div class="action-list">';
        nightState.actions.forEach(action => {
            if (action.actorId === player.id) {
                const target = roomPlayers.find(p => p.id === action.targetId);
                const prop = ACTION_PROPERTIES[action.action];
                if (target && prop) {
                    actionListHTML += `
                        <div class="action-item" data-action-id="${action.id}">
                            <i class="fas fa-arrow-right"></i>
                            <span class="action-type-${prop.type}">${UNIVERSAL_ACTIONS[action.action]}</span>
                            <span class="target-name">${target.name}</span>
                            <button class="remove-action-btn" title="Xóa hành động">&times;</button>
                        </div>`;
                }
            }
        });
        actionListHTML += '</div>';
        row.innerHTML = headerHTML + actionListHTML;
        return row;
    };

    const renderNightTabs = () => {
        nightTabsContainer.innerHTML = '';
        nightStates.forEach((_, index) => {
            const tab = document.createElement('button');
            tab.className = 'night-tab';
            tab.textContent = `Đêm ${index + 1}`;
            tab.addEventListener('click', () => {
                activeNightIndex = index;
                renderAndUpdate();
            });
            nightTabsContainer.appendChild(tab);
        });
    };

    const handleTableClick = (e) => {
        const target = e.target;
        const row = target.closest('.player-row');
        if (!row) return;
        const actorId = row.dataset.playerId;
        const nightState = nightStates[activeNightIndex];
        if (target.closest('.add-action-btn')) {
            const actionSelect = row.querySelector('.action-select');
            const targetSelect = row.querySelector('.target-select');
            const action = actionSelect.value;
            const targetId = targetSelect.value;
            if (action && targetId) {
                // SỬA LỖI: Thêm ID duy nhất vào hành động
                nightState.actions.push({ id: nextActionId++, actorId, action, targetId });
                renderAndUpdate();
            }
        }
        if (target.closest('.remove-action-btn')) {
            const actionItem = target.closest('.action-item');
            // SỬA LỖI: Tìm và xóa hành động bằng ID duy nhất
            const actionIdToRemove = parseInt(actionItem.dataset.actionId, 10);
            const indexToDelete = nightState.actions.findIndex(act => act.id === actionIdToRemove);
            if (indexToDelete > -1) {
                nightState.actions.splice(indexToDelete, 1);
                renderAndUpdate();
            }
        }
        if (target.closest('.status-btn.life')) {
             if (nightState.playersStatus[actorId]) {
                nightState.playersStatus[actorId].isAlive = !nightState.playersStatus[actorId].isAlive;
                renderAndUpdate();
            }
        }
    };

    const handleAddNight = () => {
        const newNight = createNewNightState();
        nightStates.push(newNight);
        activeNightIndex = nightStates.length - 1;
        renderNightTabs();
        renderAndUpdate();
    };

    const handleResetNight = () => {
        if (!confirm(`Bạn có chắc muốn xóa tất cả hành động trong Đêm ${activeNightIndex + 1} không?`)) return;
        const activeNight = nightStates[activeNightIndex];
        if (activeNight) {
            activeNight.actions = [];
            renderAndUpdate();
        }
    };

    const initialize = (roomId) => {
        roomIdDisplay.textContent = roomId;
        const roomRef = database.ref(`rooms/${roomId}/players`);
        roomRef.once('value', (snapshot) => {
            const playersData = snapshot.val();
            if (playersData) {
                roomPlayers = Object.keys(playersData).map(key => ({ id: key, ...playersData[key] }));
                addNightBtn.addEventListener('click', handleAddNight);
                resetNightBtn.addEventListener('click', handleResetNight);
                interactionTable.addEventListener('click', handleTableClick);
                handleAddNight();
            } else {
                interactionTable.innerHTML = '<p>Không tìm thấy dữ liệu người chơi trong phòng này.</p>';
            }
        }, (error) => {
            console.error(error);
            interactionTable.innerHTML = '<p>Lỗi khi tải dữ liệu phòng.</p>';
        });
    };

    currentRoomId = getRoomIdFromURL();
    if (currentRoomId) {
        initialize(currentRoomId);
    } else {
        document.body.innerHTML = '<h1>Lỗi: Không tìm thấy ID phòng. Vui lòng quay lại trang quản trị.</h1>';
    }
});