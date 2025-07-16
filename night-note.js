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
    const ROLE_ACTIONS = {
        'Sói': ['Bite'],
        'Bảo Vệ': ['Protect'],
        'Tiên Tri': ['Check'],
        'Phù Thủy': ['Heal', 'Kill'],
        'Thợ Săn': [], // Thụ động
        'Sát Nhân': ['Kill'],
        'Sói Nguyền': ['Curse'],
        'Dân Làng': [],
        // Thêm các vai trò và hành động khác ở đây
    };

    const ACTION_PROPERTIES = {
        'Bite': { type: 'damage', value: 1 },
        'Kill': { type: 'damage', value: 1 },
        'Protect': { type: 'defense', value: Infinity }, // Bảo vệ khỏi mọi sát thương
        'Heal': { type: 'defense', value: Infinity },
        'Check': { type: 'info' },
        'Curse': { type: 'status_effect' }
    };

    // --- State Management ---
    let currentRoomId = null;
    let roomPlayers = []; // Dữ liệu gốc từ Firebase
    let nightStates = []; // Mảng lưu trạng thái của tất cả các đêm
    let activeNightIndex = 0;

    // --- Core Functions ---
    const getRoomIdFromURL = () => new URLSearchParams(window.location.search).get('roomId');

    const createNewNightState = () => {
        const lastNightState = nightStates.length > 0 ? nightStates[nightStates.length - 1] : null;
        let playersStatus = {};

        if (lastNightState) {
            const lastNightResults = calculateNightResults(lastNightState);
            playersStatus = lastNightResults.finalStatus;
        } else {
            roomPlayers.forEach(p => {
                playersStatus[p.id] = { isAlive: true, isCursed: false };
            });
        }
        
        return {
            actions: [], // Danh sách các hành động trong đêm
            playersStatus: playersStatus // Trạng thái sống/chết/nguyền của người chơi đầu đêm
        };
    };

    const calculateNightResults = (nightState) => {
        // B1: Khởi tạo trạng thái tạm thời cho mỗi người chơi
        let tempStatus = {};
        const alivePlayerIds = Object.keys(nightState.playersStatus).filter(pId => nightState.playersStatus[pId].isAlive);

        alivePlayerIds.forEach(pId => {
            tempStatus[pId] = {
                damage: 0,
                isProtected: false,
                isHealed: false,
            };
        });

        // B2: Xử lý các hành động phòng thủ trước (Bảo Vệ, Cứu)
        nightState.actions.forEach(({ action, targetId }) => {
            if (!tempStatus[targetId]) return;
            const prop = ACTION_PROPERTIES[action];
            if (prop?.type === 'defense') {
                if (action === 'Protect') tempStatus[targetId].isProtected = true;
                if (action === 'Heal') tempStatus[targetId].isHealed = true;
            }
        });

        // B3: Xử lý các hành động tấn công
        nightState.actions.forEach(({ action, targetId }) => {
            if (!tempStatus[targetId]) return;
            const prop = ACTION_PROPERTIES[action];
            if (prop?.type === 'damage' && !tempStatus[targetId].isProtected) {
                tempStatus[targetId].damage += prop.value;
            }
        });
        
        // B4: Quyết định kết quả cuối cùng
        let finalStatus = JSON.parse(JSON.stringify(nightState.playersStatus));
        let deadPlayerNames = [];

        alivePlayerIds.forEach(pId => {
            const player = tempStatus[pId];
            const willDie = player.damage > 0 && !player.isHealed;
            if (willDie) {
                finalStatus[pId].isAlive = false;
                const playerData = roomPlayers.find(p => p.id === pId);
                if (playerData) deadPlayerNames.push(playerData.name);
            }
        });

        return { deadPlayerNames, finalStatus };
    };

    const updateUI = () => {
        const activeNight = nightStates[activeNightIndex];
        if (!activeNight) return;
        
        renderNight(activeNightIndex); // Vẽ lại toàn bộ giao diện của đêm hiện tại
        
        const { deadPlayerNames } = calculateNightResults(activeNight);
        if (deadPlayerNames.length > 0) {
            nightResultsDiv.innerHTML = '<strong>Sẽ chết:</strong> ' + deadPlayerNames.map(name => `<span class="dead-player">${name}</span>`).join(', ');
        } else {
            nightResultsDiv.innerHTML = '<p>Chưa có ai chết...</p>';
        }
    };

    // --- UI Rendering Functions ---
    const createPlayerRow = (player, nightState) => {
        const row = document.createElement('div');
        row.className = 'player-row';
        row.dataset.playerId = player.id;
        const playerStatus = nightState.playersStatus[player.id];

        if (!playerStatus || !playerStatus.isAlive) {
            row.classList.add('status-dead');
        }

        const availableActions = ROLE_ACTIONS[player.roleName] || [];
        const livingPlayers = roomPlayers.filter(p => nightState.playersStatus[p.id]?.isAlive);

        // Phần header của người chơi (Tên, vai trò, nút sống/chết)
        let headerHTML = `
            <div class="player-header">
                <div class="player-info">
                    <div class="player-name">${player.name}</div>
                    <div class="player-role">${player.roleName}</div>
                </div>
                <div class="player-status-controls">
                    <button class="status-btn life ${playerStatus?.isAlive ? 'active alive' : 'dead'}" data-status="life" title="Đánh dấu Sống/Chết"><i class="fas fa-heart"></i></button>
                </div>
        `;

        // Chỉ hiển thị bộ điều khiển hành động nếu người chơi còn sống và có hành động
        if (playerStatus?.isAlive && availableActions.length > 0) {
            headerHTML += `
                <div class="action-controls">
                    <select class="action-select">
                        <option value="">-- Chọn hành động --</option>
                        ${availableActions.map(act => `<option value="${act}">${act}</option>`).join('')}
                    </select>
                    <select class="target-select">
                        <option value="">-- Chọn mục tiêu --</option>
                        ${livingPlayers.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                    </select>
                    <button class="add-action-btn" title="Thêm hành động này"><i class="fas fa-plus"></i></button>
                </div>
            `;
        }
        headerHTML += `</div>`; // Đóng player-header

        // Phần danh sách các hành động đã thực hiện
        const playerActions = nightState.actions.filter(a => a.actorId === player.id);
        let actionListHTML = '<div class="action-list">';
        playerActions.forEach((action, index) => {
            const target = roomPlayers.find(p => p.id === action.targetId);
            if (target) {
                actionListHTML += `
                    <div class="action-item" data-action-index="${index}">
                        <i class="fas fa-arrow-right"></i>
                        <span class="action-type-${action.action.toLowerCase()}">${action.action}</span>
                        <span class="target-name">${target.name}</span>
                        <button class="remove-action-btn" title="Xóa hành động">&times;</button>
                    </div>
                `;
            }
        });
        actionListHTML += '</div>';

        row.innerHTML = headerHTML + actionListHTML;
        return row;
    };

    const renderNight = (nightIndex) => {
        activeNightIndex = nightIndex;
        const nightState = nightStates[nightIndex];
        if (!nightState) return;

        interactionTable.innerHTML = '';
        const alivePlayers = roomPlayers.filter(p => nightState.playersStatus[p.id]?.isAlive);
        const deadPlayers = roomPlayers.filter(p => !nightState.playersStatus[p.id]?.isAlive);

        [...alivePlayers, ...deadPlayers].forEach(player => {
            const playerRow = createPlayerRow(player, nightState);
            interactionTable.appendChild(playerRow);
        });

        document.querySelectorAll('.night-tab').forEach((tab, index) => {
            tab.classList.toggle('active', index === activeNightIndex);
        });
    };

    const renderNightTabs = () => {
        nightTabsContainer.innerHTML = '';
        nightStates.forEach((_, index) => {
            const tab = document.createElement('button');
            tab.className = 'night-tab';
            tab.textContent = `Đêm ${index + 1}`;
            tab.dataset.index = index;
            if (index === activeNightIndex) tab.classList.add('active');
            tab.addEventListener('click', () => {
                renderNight(index);
                updateUI();
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

        // Xử lý thêm hành động
        if (target.closest('.add-action-btn')) {
            const actionSelect = row.querySelector('.action-select');
            const targetSelect = row.querySelector('.target-select');
            const action = actionSelect.value;
            const targetId = targetSelect.value;

            if (action && targetId) {
                nightState.actions.push({ actorId, action, targetId });
                updateUI();
                actionSelect.value = '';
                targetSelect.value = '';
            }
        }

        // Xử lý xóa hành động
        if (target.closest('.remove-action-btn')) {
            const actionItem = target.closest('.action-item');
            const actionIndex = parseInt(actionItem.dataset.actionIndex, 10);
            // Lọc ra các hành động của đúng người chơi đó trước khi xóa theo index
            const actorActionsIndices = nightState.actions
                .map((act, idx) => ({ ...act, originalIndex: idx }))
                .filter(act => act.actorId === actorId);
            
            const originalIndexToDelete = actorActionsIndices[actionIndex]?.originalIndex;

            if (originalIndexToDelete !== undefined) {
                nightState.actions.splice(originalIndexToDelete, 1);
                updateUI();
            }
        }
        
        // Xử lý nút Sống/Chết
        if (target.closest('.status-btn.life')) {
             if (nightState.playersStatus[actorId]) {
                nightState.playersStatus[actorId].isAlive = !nightState.playersStatus[actorId].isAlive;
                updateUI();
            }
        }
    };

    const handleAddNight = () => {
        const newNight = createNewNightState();
        nightStates.push(newNight);
        renderNightTabs();
        renderNight(nightStates.length - 1);
        updateUI();
    };

    const handleResetNight = () => {
        if (!confirm(`Bạn có chắc muốn xóa tất cả hành động trong Đêm ${activeNightIndex + 1} không?`)) return;
        const activeNight = nightStates[activeNightIndex];
        if (activeNight) {
            activeNight.actions = [];
            updateUI();
        }
    };

    // --- Initial Load ---
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
                
                handleAddNight(); // Tự động tạo đêm đầu tiên
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