// =================================================================
// === admin.js - PHIÊN BẢN HOÀN THIỆN CHO PROXY ===
console.log("ĐANG CHẠY admin.js PHIÊN BẢN HOÀN THIỆN!");
// =================================================================

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
    
    const API_ENDPOINT = "/api/sheets"; 

    // --- DOM Elements ---
    const setupSection = document.getElementById('setup-section');
    const activeRoomSection = document.getElementById('active-room-section');
    const createRoomBtn = document.getElementById('create-room-btn');
    const roomIdDisplay = document.getElementById('room-id-display');
    const rolesByFactionContainer = document.getElementById('roles-by-faction');
    const rolesInGameList = document.getElementById('roles-in-game-list');
    const playerList = document.getElementById('player-list');
    const playersJoinedDisplay = document.getElementById('players-joined');
    const playersTotalDisplay = document.getElementById('players-total');
    const sendRolesBtn = document.getElementById('send-roles-btn');
    const clearGamelogBtn = document.getElementById('clear-gamelog-btn');
    const deleteRoomBtn = document.getElementById('delete-room-btn');

    let currentRoomId = null;
    let totalPlayers = 0;
    let players = {};
    let playerListener = null;

    // --- Functions ---
    const loadRolesFromSheet = async () => {
        try {
            const response = await fetch(`${API_ENDPOINT}?action=getRoles`);
            if (!response.ok) {
                 const errorData = await response.json().catch(() => ({ details: `Máy chủ proxy phản hồi với mã lỗi ${response.status}` }));
                 throw new Error(errorData.details);
            }
            const allRolesFromSheet = await response.json();
            if (allRolesFromSheet.error) throw new Error(allRolesFromSheet.error);
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
            console.error("Lỗi nghiêm trọng khi tải vai trò:", error);
            rolesByFactionContainer.innerHTML = `<p style='color:red;'>Lỗi tải vai trò: ${error.message}.</p>`;
        }
    };

    const sendRoles = async () => {
        if (!confirm('Bạn có chắc muốn gửi vai trò và lưu log?')) return;
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
            // Gửi yêu cầu POST đúng chuẩn
            await fetch(API_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'saveGameLog', payload: logPayload })
            });
            alert('Đã gửi vai trò và lưu vào Google Sheet!');
        } catch(error) {
            console.error('Lỗi khi lưu vào Google Sheet:', error);
            alert('Đã gửi vai trò nhưng có lỗi khi lưu vào Google Sheet.');
        }
        database.ref(`${currentRoomId}/gameState`).update({ status: 'roles-sent', message: 'Quản trò đã gửi vai trò.' });
        sendRolesBtn.disabled = true;
    };

    const clearGameLog = async () => {
        if (!confirm('Bạn có chắc muốn xóa log game?')) return;
        try {
            // Gửi yêu cầu POST đúng chuẩn
            await fetch(API_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'clearGameLog' })
            });
            alert('Đã gửi yêu cầu xóa log.');
        } catch (error) {
            console.error('Lỗi khi xóa log:', error);
            alert('Có lỗi xảy ra khi xóa log.');
        }
    };

    // Các hàm còn lại không thay đổi
    const createRoom = () => {
        currentRoomId = `room-${Math.random().toString(36).substr(2, 6)}`;
        roomIdDisplay.textContent = currentRoomId;
        totalPlayers = parseInt(document.getElementById('total-players').value);
        const selectedRolesNodes = document.querySelectorAll('input[name="selected-role"]:checked');
        const selectedRoles = Array.from(selectedRolesNodes).map(node => node.value);
        if (selectedRoles.length === 0) {
            alert('Vui lòng chọn ít nhất một vai trò!');
            return;
        }
        database.ref(currentRoomId).set({
            totalPlayers: totalPlayers,
            rolesToAssign: selectedRoles,
            players: {},
            gameState: { status: 'waiting', message: 'Chờ người chơi tham gia...' }
        });
        setupSection.classList.add('hidden');
        activeRoomSection.classList.remove('hidden');
        rolesInGameList.innerHTML = '';
        selectedRoles.forEach(role => {
            const li = document.createElement('li');
            li.textContent = role;
            rolesInGameList.appendChild(li);
        });
        playersTotalDisplay.textContent = totalPlayers;
        listenForPlayers(currentRoomId);
    };
    const listenForPlayers = (roomId) => {
        const playersRef = database.ref(`${roomId}/players`);
        if (playerListener) playersRef.off('value', playerListener);
        playerListener = playersRef.on('value', (snapshot) => {
            players = snapshot.val() || {};
            updatePlayerListUI(players);
            const playerCount = Object.keys(players).length;
            playersJoinedDisplay.textContent = playerCount;
            sendRolesBtn.disabled = playerCount !== totalPlayers;
        });
    };
    const updatePlayerListUI = (playersData) => {
        playerList.innerHTML = '';
        for (const playerId in playersData) {
            const player = playersData[playerId];
            const li = document.createElement('li');
            li.className = 'player-item';
            if (!player.isAlive) li.classList.add('dead');
            li.innerHTML = `<span class="player-name">${player.name} ${player.role ? `<strong>(${player.role})</strong>` : ''}</span>`;
            playerList.appendChild(li);
        }
    };
    const deleteRoom = () => {
        if (!currentRoomId || !confirm(`Bạn có chắc muốn xóa phòng '${currentRoomId}'?`)) return;
        if (playerListener) {
            database.ref(`${currentRoomId}/players`).off('value', playerListener);
            playerListener = null;
        }
        database.ref(currentRoomId).remove()
            .then(() => {
                alert(`Phòng '${currentRoomId}' đã được xóa.`);
                resetAdminUI();
            })
            .catch((error) => alert("Lỗi khi xóa phòng: " + error.message));
    };
    const resetAdminUI = () => {
        currentRoomId = null;
        players = {};
        totalPlayers = 0;
        roomIdDisplay.textContent = "Chưa tạo";
        activeRoomSection.classList.add('hidden');
        setupSection.classList.remove('hidden');
        playerList.innerHTML = '';
        rolesInGameList.innerHTML = '';
        playersJoinedDisplay.textContent = '0';
        playersTotalDisplay.textContent = '0';
    };
    createRoomBtn.addEventListener('click', createRoom);
    sendRolesBtn.addEventListener('click', sendRoles);
    clearGamelogBtn.addEventListener('click', clearGameLog);
    deleteRoomBtn.addEventListener('click', deleteRoom);
    loadRolesFromSheet();
});