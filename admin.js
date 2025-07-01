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
    
    // THAY ĐỔI QUAN TRỌNG: Chúng ta không cần URL Google Script ở đây nữa
    // const GOOGLE_SCRIPT_URL = "URL_CŨ_CỦA_BẠN"; 
    const API_PROXY_ENDPOINT = "/api/proxy"; // Đây là cầu nối trung gian của chúng ta

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

    // THAY ĐỔI QUAN TRỌNG: Hàm tải vai trò giờ sẽ gọi đến proxy
    const loadRolesFromSheet = async () => {
        try {
            // Gọi đến cầu nối trung gian thay vì gọi trực tiếp đến Google
            const response = await fetch(`${API_PROXY_ENDPOINT}?action=getRoles`);
            
            if (!response.ok) {
                 const errorData = await response.json();
                 throw new Error(errorData.details || `Server responded with ${response.status}`);
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
            console.error("Failed to load roles:", error);
            rolesByFactionContainer.innerHTML = `<p style='color:red;'>Lỗi tải vai trò: ${error.message}.</p>`;
        }
    };

    // Các hàm còn lại giữ nguyên logic, chỉ cần thay đổi cách gọi fetch nếu cần
    // (Trong trường hợp này, các hàm còn lại không gọi đến Google Script nên không cần sửa)

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

    // THAY ĐỔI: Hàm sendRoles và clearGameLog cần được cập nhật
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
            // Gọi đến proxy thay vì gọi trực tiếp
            await fetch(`${API_PROXY_ENDPOINT}?action=saveGameLog`, {
                method: 'POST', // Chuyển phương thức POST qua proxy
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ payload: logPayload })
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
        if (!confirm('Hành động này chỉ xóa dữ liệu trong sheet \'GameLog\'. Bạn có chắc muốn tiếp tục?')) return;
        try {
            // Gọi đến proxy
            await fetch(`${API_PROXY_ENDPOINT}?action=clearGameLog`, { method: 'POST' });
            alert('Đã gửi yêu cầu xóa dữ liệu trên Google Sheet.');
        } catch (error) {
            console.error('Failed to clear game log:', error);
            alert('Có lỗi xảy ra khi xóa dữ liệu.');
        }
    };

    const deleteRoom = () => {
        if (!currentRoomId) {
            alert("Không có phòng nào để xóa.");
            return;
        }
        if (!confirm(`Bạn có chắc muốn xóa vĩnh viễn phòng '${currentRoomId}'?`)) return;

        if (playerListener) {
            database.ref(`${currentRoomId}/players`).off('value', playerListener);
            playerListener = null;
        }

        database.ref(currentRoomId).remove()
            .then(() => {
                alert(`Phòng '${currentRoomId}' đã được xóa.`);
                resetAdminUI();
            })
            .catch((error) => {
                alert("Lỗi khi xóa phòng: " + error.message);
            });
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

    // --- Event Listeners ---
    createRoomBtn.addEventListener('click', createRoom);
    sendRolesBtn.addEventListener('click', sendRoles);
    clearGamelogBtn.addEventListener('click', clearGameLog);
    deleteRoomBtn.addEventListener('click', deleteRoom);
    
    loadRolesFromSheet();
});