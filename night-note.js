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

    // --- State Management ---
    let currentRoomId = null;
    let roomPlayers = []; // Dữ liệu gốc từ Firebase
    let nightStates = []; // Mảng lưu trạng thái của tất cả các đêm
    let activeNightIndex = 0; // Đêm hiện tại đang xem

    // --- Core Functions ---
    const getRoomIdFromURL = () => new URLSearchParams(window.location.search).get('roomId');

    const createNewNightState = () => {
        const lastNightState = nightStates.length > 0 ? nightStates[nightStates.length - 1] : null;
        const newNight = { players: {} };
        
        // Tính toán trạng thái sống/chết từ đêm trước
        const lastNightCalculated = lastNightState ? calculateNightResults(lastNightState) : null;

        roomPlayers.forEach(player => {
            // Người chơi bắt đầu đêm mới với trạng thái sống/chết của cuối đêm trước
            const isAlive = lastNightCalculated ? !lastNightCalculated[player.id]?.isDead : player.isAlive;
            
            newNight.players[player.id] = {
                id: player.id, name: player.name, roleName: player.roleName,
                isAlive: isAlive,
                abilityOn: true,
                interactions: {
                    wolf_bite: false, wolf_dmg: false, villager_dmg: false, other_dmg: false,
                    protect: false, save: false, armor: false,
                },
                group: null
            };
        });
        return newNight;
    };

    const calculateNightResults = (nightState) => {
        let calculatedPlayers = JSON.parse(JSON.stringify(nightState.players));
        let groups = {};

        for (const pId in calculatedPlayers) {
            const player = calculatedPlayers[pId];
            if (!player.isAlive) continue;

            player.damage = 0;
            if (player.interactions.wolf_bite) player.damage++;
            if (player.interactions.wolf_dmg) player.damage++;
            if (player.interactions.villager_dmg) player.damage++;
            if (player.interactions.other_dmg) player.damage++;
            
            if (player.interactions.armor && player.damage > 0) player.damage--;
            if (player.interactions.protect) player.damage = 0;

            if (player.group) {
                if (!groups[player.group]) groups[player.group] = [];
                groups[player.group].push(pId);
            }
        }

        for (const groupId in groups) {
            const memberIds = groups[groupId];
            const totalGroupDamage = memberIds.reduce((sum, pId) => sum + calculatedPlayers[pId].damage, 0);
            if (totalGroupDamage > 0) {
                memberIds.forEach(pId => {
                    calculatedPlayers[pId].damage = Math.max(calculatedPlayers[pId].damage, 1);
                });
            }
        }

        for (const pId in calculatedPlayers) {
            const player = calculatedPlayers[pId];
            player.isDanger = false;
            player.isDead = false;
            if (player.isAlive && player.damage > 0) {
                if (!player.interactions.save) player.isDead = true;
                player.isDanger = true;
            }
        }
        return calculatedPlayers;
    };

    const updateUI = () => {
        const activeNight = nightStates[activeNightIndex];
        if (!activeNight) return;
        const calculatedStates = calculateNightResults(activeNight);

        document.querySelectorAll('.player-row').forEach(row => {
            const playerId = row.dataset.playerId;
            const playerState = calculatedStates[playerId];
            if (!playerState) return;

            row.classList.remove('status-danger', 'status-dead-calculated');
            if (playerState.isDanger) row.classList.add('status-danger');
            if (playerState.isDead) row.classList.add('status-dead-calculated');
        });

        const deadPlayers = Object.values(calculatedStates).filter(p => p.isDead);
        if (deadPlayers.length > 0) {
            nightResultsDiv.innerHTML = '<strong>Sẽ chết:</strong> ' + deadPlayers.map(p => `<span class="dead-player">${p.name}</span>`).join(', ');
        } else {
            nightResultsDiv.innerHTML = '<p>Chưa có ai chết...</p>';
        }
    };

    // --- UI Rendering Functions ---
    const createPlayerRow = (playerState) => {
        const row = document.createElement('div');
        row.className = 'player-row';
        row.dataset.playerId = playerState.id;
        if (!playerState.isAlive) row.classList.add('status-dead');

        row.innerHTML = `
            <div class="player-info">
                <div class="player-name">${playerState.name}</div>
                <div class="player-role">${playerState.roleName || 'Chưa có vai'}</div>
            </div>
            <div class="player-status-controls">
                <button class="status-btn life ${playerState.isAlive ? 'active alive' : 'dead'}" data-status="life" title="Đánh dấu Sống/Chết"><i class="fas fa-heart"></i></button>
                <button class="status-btn ability ${playerState.abilityOn ? 'active ability-on' : 'ability-off'}" data-status="ability" title="Đánh dấu Chức năng còn/mất"><i class="fas fa-star"></i></button>
            </div>
            <div class="interaction-group">
                <label class="checkbox-label" title="Sói cắn"><input type="checkbox" data-action="wolf_bite" ${playerState.interactions.wolf_bite ? 'checked' : ''}> Sói cắn</label>
                <label class="checkbox-label" title="Sát thương Sói"><input type="checkbox" data-action="wolf_dmg" ${playerState.interactions.wolf_dmg ? 'checked' : ''}> ST Sói</label>
                <label class="checkbox-label" title="Sát thương Dân"><input type="checkbox" data-action="villager_dmg" ${playerState.interactions.villager_dmg ? 'checked' : ''}> ST Dân</label>
                <label class="checkbox-label" title="Sát thương Khác"><input type="checkbox" data-action="other_dmg" ${playerState.interactions.other_dmg ? 'checked' : ''}> ST Khác</label>
                <label class="checkbox-label" title="Bảo vệ"><input type="checkbox" data-action="protect" ${playerState.interactions.protect ? 'checked' : ''}> Bảo vệ</label>
                <label class="checkbox-label" title="Cứu"><input type="checkbox" data-action="save" ${playerState.interactions.save ? 'checked' : ''}> Cứu</label>
                <label class="checkbox-label" title="Giáp"><input type="checkbox" data-action="armor" ${playerState.interactions.armor ? 'checked' : ''}> Giáp</label>
            </div>
            <div class="grouping-control">
                <input type="number" min="1" placeholder="Nhóm" title="Nhập số nhóm" value="${playerState.group || ''}">
            </div>`;
        return row;
    };

    const renderNight = (nightIndex) => {
        activeNightIndex = nightIndex;
        const nightState = nightStates[nightIndex];
        if (!nightState) return;

        interactionTable.innerHTML = '';
        Object.values(nightState.players).sort((a,b) => a.name.localeCompare(b.name)).forEach(playerState => {
            const playerRow = createPlayerRow(playerState);
            interactionTable.appendChild(playerRow);
        });

        document.querySelectorAll('.night-tab').forEach((tab, index) => {
            tab.classList.toggle('active', index === activeNightIndex);
        });
        updateUI();
    };

    const renderNightTabs = () => {
        nightTabsContainer.innerHTML = '';
        nightStates.forEach((_, index) => {
            const tab = document.createElement('button');
            tab.className = 'night-tab';
            tab.textContent = `Đêm ${index + 1}`;
            tab.dataset.index = index;
            if (index === activeNightIndex) tab.classList.add('active');
            tab.addEventListener('click', () => renderNight(index));
            nightTabsContainer.appendChild(tab);
        });
    };

    // --- Event Handlers ---
    const handleInteractionChange = (e) => {
        const target = e.target;
        const row = target.closest('.player-row');
        if (!row) return;

        const playerId = row.dataset.playerId;
        const activeNight = nightStates[activeNightIndex];
        const playerState = activeNight.players[playerId];

        if (target.matches('input[type="checkbox"]')) {
            playerState.interactions[target.dataset.action] = target.checked;
        } else if (target.matches('input[type="number"]')) {
            playerState.group = target.value ? parseInt(target.value, 10) : null;
        } else if (target.matches('.status-btn[data-status="life"]')) {
            playerState.isAlive = !playerState.isAlive;
            row.classList.toggle('status-dead', !playerState.isAlive);
            target.classList.toggle('alive', playerState.isAlive);
            target.classList.toggle('dead', !playerState.isAlive);
        } else if (target.matches('.status-btn[data-status="ability"]')) {
            playerState.abilityOn = !playerState.abilityOn;
            target.classList.toggle('ability-on', playerState.abilityOn);
            target.classList.toggle('ability-off', !playerState.abilityOn);
        }
        updateUI();
    };

    const handleAddNight = () => {
        const newNight = createNewNightState();
        nightStates.push(newNight);
        activeNightIndex = nightStates.length - 1;
        renderNightTabs();
        renderNight(activeNightIndex);
    };

    const handleResetNight = () => {
        if (!confirm(`Bạn có chắc muốn xóa tất cả tương tác trong Đêm ${activeNightIndex + 1} không?`)) return;
        const activeNight = nightStates[activeNightIndex];
        for(const pId in activeNight.players) {
            const player = activeNight.players[pId];
            player.interactions = {
                wolf_bite: false, wolf_dmg: false, villager_dmg: false, other_dmg: false,
                protect: false, save: false, armor: false,
            };
            player.group = null;
        }
        renderNight(activeNightIndex);
    };

    // --- Initial Load ---
    const initialize = (roomId) => {
        roomIdDisplay.textContent = roomId;
        const roomRef = database.ref(`rooms/${roomId}/players`);
        
        roomRef.once('value', (snapshot) => {
            const playersData = snapshot.val();
            if (playersData) {
                roomPlayers = Object.values(playersData);
                // Gán sự kiện cho các nút
                addNightBtn.addEventListener('click', handleAddNight);
                resetNightBtn.addEventListener('click', handleResetNight);
                interactionTable.addEventListener('input', handleInteractionChange); // 'input' hiệu quả hơn 'change'
                interactionTable.addEventListener('click', (e) => {
                    if (e.target.closest('.status-btn')) handleInteractionChange(e);
                });
                // Tự động tạo đêm đầu tiên
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