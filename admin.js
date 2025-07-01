document.addEventListener('DOMContentLoaded', () => {
    // --- Firebase & Google Script Configuration ---
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
    
    // Đảm bảo bạn đã dán đúng URL Web App của mình vào đây
    const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyYDmNsnaECuVh2bjKeHQTvW9zRfgMFFV9TlnZvwW0wceuON4iCpQdWQ8mXZnD9YBNIng/exec"; 

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
    let playerListener = null; // Biến để lưu listener, giúp ta ngắt kết nối khi cần

    // --- Functions ---

    // Hàm tải vai trò từ Google Sheet (giữ nguyên)
    const loadRolesFromSheet = async () => {
        try {
            const response = await fetch(`${GOOGLE_SCRIPT_URL}?action=getRoles`);
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
            console.error("Failed to load roles:", error);
            rolesByFactionContainer.innerHTML = `<p style='color:red;'>Lỗi tải vai trò: ${error.message}.</p>`;
        }
    };

    // SỬA ĐỔI: Hàm tạo phòng
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

        // Cập nhật giao diện
        setupSection.classList.add('hidden');
        activeRoomSection.classList.remove('hidden');
        
        // Hiển thị các vai trò đã chọn trong khu vực quản lý
        rolesInGameList.innerHTML = '';
        selectedRoles.forEach(role => {
            const li = document.createElement('li');
            li.textContent = role;
            rolesInGameList.appendChild(li);
        });

        playersTotalDisplay.textContent = totalPlayers;
        listenForPlayers(currentRoomId);
    };
    
    // Hàm lắng nghe người chơi tham gia (giữ nguyên)
    const listenForPlayers = (roomId) => {
        const playersRef = database.ref(`${roomId}/players`);
        // Ngắt listener cũ nếu có
        if (playerListener) playersRef.off('value', playerListener);
        
        playerListener = playersRef.on('value', (snapshot) => {
            players = snapshot.val() || {};
            updatePlayerListUI(players);
            const playerCount = Object.keys(players).length;
            playersJoinedDisplay.textContent = playerCount;
            sendRolesBtn.disabled = playerCount !== totalPlayers;
        });
    };
    
    // Hàm cập nhật danh sách người chơi trên UI (giữ nguyên)
    const updatePlayerListUI = (playersData) => {
        playerList.innerHTML = '';
        for (const playerId in playersData) {
            const player = playersData[playerId];
            const li = document.createElement('li');
            li.className = 'player-item';
            // Thêm class 'dead' nếu người chơi đã chết
            if (!player.isAlive) li.classList.add('dead');
            
            li.innerHTML = `<span class="player-name">${player.name} ${player.role ? `<strong>(${player.role})</strong>` : ''}</span>`;
            playerList.appendChild(li);
        }
    };

    // Hàm gửi vai trò (giữ nguyên)
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

    // Hàm xóa log trên Google Sheet (giữ nguyên)
    const clearGameLog = async () => {
        if (!confirm('Hành động này chỉ xóa dữ liệu trong sheet \'GameLog\'. Bạn có chắc muốn tiếp tục?')) return;
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

    // HÀM MỚI: Xóa phòng khỏi Firebase và reset giao diện
    const deleteRoom = () => {
        if (!currentRoomId) {
            alert("Không có phòng nào để xóa.");
            return;
        }
        if (!confirm(`Bạn có chắc muốn xóa vĩnh viễn phòng '${currentRoomId}'? Tất cả dữ liệu của phòng này trên Firebase sẽ bị mất.`)) return;

        // Ngắt kết nối listener để tránh lỗi
        if (playerListener) {
            database.ref(`${currentRoomId}/players`).off('value', playerListener);
            playerListener = null;
        }

        // Xóa dữ liệu trên Firebase
        database.ref(currentRoomId).remove()
            .then(() => {
                alert(`Phòng '${currentRoomId}' đã được xóa thành công.`);
                // Reset giao diện về trạng thái ban đầu
                resetAdminUI();
            })
            .catch((error) => {
                alert("Có lỗi xảy ra khi xóa phòng: " + error.message);
                console.error("Error deleting room: ", error);
            });
    };

    // HÀM MỚI: Reset giao diện về trạng thái ban đầu
    const resetAdminUI = () => {
        currentRoomId = null;
        players = {};
        totalPlayers = 0;
        
        roomIdDisplay.textContent = "Chưa tạo";
        activeRoomSection.classList.add('hidden');
        setupSection.classList.remove('hidden');

        // Xóa danh sách người chơi và vai trò cũ
        playerList.innerHTML = '';
        rolesInGameList.innerHTML = '';
        playersJoinedDisplay.textContent = '0';
        playersTotalDisplay.textContent = '0';
    };


    // --- Event Listeners ---
    createRoomBtn.addEventListener('click', createRoom);
    sendRolesBtn.addEventListener('click', sendRoles);
    clearGamelogBtn.addEventListener('click', clearGameLog);
    deleteRoomBtn.addEventListener('click', deleteRoom); // Gắn sự kiện cho nút xóa mới
    
    // Tải vai trò ngay khi trang được mở
    loadRolesFromSheet();
});