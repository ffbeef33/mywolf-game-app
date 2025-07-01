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

    // ▼▼▼ DÁN URL WEB APP BẠN ĐÃ COPY Ở BƯỚC 1 VÀO ĐÂY ▼▼▼
    const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz_U1kIxDiJUqkLOpB51fVhR7iX8edcOmxyNimcOTwGNLZOsEYrrPU0oLSgtHGIo9pRaQ/exec"; 

    // --- DOM Elements ---
    const createRoomBtn = document.getElementById('create-room-btn');
    const roomIdDisplay = document.getElementById('room-id');
    const setupSection = document.getElementById('setup-section');
    const gameManagementSection = document.getElementById('game-management-section');
    const votingSection = document.getElementById('voting-section');
    const playerList = document.getElementById('player-list');
    const playersJoinedDisplay = document.getElementById('players-joined');
    const playersTotalDisplay = document.getElementById('players-total');
    const startRolePickBtn = document.getElementById('start-role-pick-btn');
    const sendRolesBtn = document.getElementById('send-roles-btn');
    const rolesByFactionContainer = document.getElementById('roles-by-faction');
    const clearGamelogBtn = document.getElementById('clear-gamelog-btn');

    let currentRoomId = null;
    let totalPlayers = 0;
    let players = {};

    const loadRolesFromSheet = async () => {
        try {
            const response = await fetch(`${GOOGLE_SCRIPT_URL}?action=getRoles`);
            const allRolesFromSheet = await response.json();
            const rolesByFaction = allRolesFromSheet.reduce((acc, role) => {
                const faction = role.Faction || 'Chưa phân loại';
                if (!acc[faction]) acc[faction] = [];
                acc[faction].push(role);
                return acc;
            }, {});

            rolesByFactionContainer.innerHTML = '';
            for (const faction in rolesByFaction) {
                let factionHtml = `<h4>${faction}</h4><div class="role-checkbox-group">`;
                rolesByFaction[faction].forEach(role => {
                    factionHtml += `<div class="role-checkbox-item">
                        <input type="checkbox" id="role-${role.RoleName}" name="selected-role" value="${role.RoleName}">
                        <label for="role-${role.RoleName}">${role.RoleName}</label>
                    </div>`;
                });
                factionHtml += `</div>`;
                rolesByFactionContainer.innerHTML += factionHtml;
            }
        } catch (error) {
            console.error("Failed to load roles:", error);
            rolesByFactionContainer.innerHTML = "<p style='color:red;'>Không thể tải danh sách vai trò từ Google Sheet.</p>";
        }
    };

    const createRoom = () => {
        const roomId = `room-${Math.random().toString(36).substr(2, 6)}`;
        currentRoomId = roomId;
        roomIdDisplay.textContent = roomId;
        localStorage.setItem('roomId', roomId);

        totalPlayers = parseInt(document.getElementById('total-players').value);
        const selectedRolesNodes = document.querySelectorAll('input[name="selected-role"]:checked');
        const selectedRoles = Array.from(selectedRolesNodes).map(node => node.value);

        if (selectedRoles.length === 0) {
            alert('Vui lòng chọn ít nhất một vai trò!');
            return;
        }

        database.ref(roomId).set({
            totalPlayers: totalPlayers,
            rolesToAssign: selectedRoles,
            players: {},
            gameState: { status: 'waiting', message: 'Chờ quản trò bắt đầu...' }
        });

        setupSection.classList.add('hidden');
        gameManagementSection.classList.remove('hidden');
        votingSection.classList.remove('hidden');
        playersTotalDisplay.textContent = totalPlayers;
        listenForPlayers(roomId);
    };

    const listenForPlayers = (roomId) => {
        const playersRef = database.ref(`${roomId}/players`);
        playersRef.on('value', (snapshot) => {
            players = snapshot.val() || {};
            updatePlayerList(players);
            const playerCount = Object.keys(players).length;
            playersJoinedDisplay.textContent = playerCount;
            startRolePickBtn.disabled = playerCount !== totalPlayers;
        });
    };
    
    const updatePlayerList = (playersData) => {
        playerList.innerHTML = '';
        for (const playerId in playersData) {
            const player = playersData[playerId];
            const playerItem = document.createElement('li');
            playerItem.className = `player-item ${!player.isAlive ? 'dead' : ''}`;
            playerItem.innerHTML = `<span class="player-name">${player.name} ${player.role ? `(${player.role})` : ''}</span>
                <div class="player-actions">
                    <button class="btn-toggle-status" data-player-id="${playerId}">${player.isAlive ? 'Giết' : 'Hồi sinh'}</button>
                    <button class="btn-kick" data-player-id="${playerId}">Kick</button>
                </div>`;
            playerList.appendChild(playerItem);
        }
    };

    const sendRoles = async () => {
        if (!confirm('Bạn có chắc muốn gửi vai trò? Hành động này sẽ phân vai và lưu vào Google Sheet.')) return;

        const rolesToAssignSnapshot = await database.ref(`${currentRoomId}/rolesToAssign`).once('value');
        let allRoles = rolesToAssignSnapshot.val() || [];
        let playerIds = Object.keys(players);
        allRoles.sort(() => Math.random() - 0.5);

        const updates = {};
        playerIds.forEach((id, index) => {
            updates[`${id}/role`] = allRoles[index] || 'Dân thường';
        });
        await database.ref(`${currentRoomId}/players`).update(updates);

        const finalPlayersSnapshot = await database.ref(`${currentRoomId}/players`).once('value');
        const finalPlayers = finalPlayersSnapshot.val();
        const logPayload = Object.values(finalPlayers).map(p => ({ name: p.name, role: p.role }));

        try {
            await fetch(GOOGLE_SCRIPT_URL, {
                method: 'POST',
                mode: 'no-cors',
                body: JSON.stringify({ action: 'saveGameLog', payload: logPayload })
            });
            alert('Đã gửi vai trò và lưu vào Google Sheet!');
        } catch(error) {
            console.error('Failed to save to Google Sheet:', error);
            alert('Đã gửi vai trò nhưng có lỗi khi lưu vào Google Sheet.');
        }

        database.ref(`${currentRoomId}/gameState`).update({ status: 'roles-sent', message: 'Quản trò đã gửi vai trò.' });
        sendRolesBtn.disabled = true;
    };

    const clearGameLog = async () => {
        if (!confirm('Bạn có chắc muốn xóa toàn bộ dữ liệu trong sheet \'GameLog\'?')) return;
        try {
            await fetch(GOOGLE_SCRIPT_URL, {
                method: 'POST',
                mode: 'no-cors',
                body: JSON.stringify({ action: 'clearGameLog' })
            });
            alert('Đã gửi yêu cầu xóa dữ liệu trên Google Sheet.');
        } catch (error) {
            console.error('Failed to clear game log:', error);
            alert('Có lỗi xảy ra khi xóa dữ liệu.');
        }
    };
    
    // Event Listeners and other functions (voting, player actions, etc.)
    createRoomBtn.addEventListener('click', createRoom);
    sendRolesBtn.addEventListener('click', sendRoles);
    clearGamelogBtn.addEventListener('click', clearGameLog);
    // ... add other listeners for voting, player actions etc. as before ...
    
    loadRolesFromSheet();
});