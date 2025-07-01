// =================================================================
// === admin.js - PHIÊN BẢN CHỌN NGƯỜI CHƠI TRỰC TIẾP ===
console.log("ĐANG CHẠY admin.js PHIÊN BẢN CHỌN NGƯỜI CHƠI TRỰC TIẾP!");
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
    const playerListContainer = document.getElementById('player-list-container');
    const roomIdDisplay = document.getElementById('room-id-display');
    const rolesByFactionContainer = document.getElementById('roles-by-faction');
    const roleCountDisplay = document.getElementById('role-count-display');
    const rolesInGameList = document.getElementById('roles-in-game-list');
    const playerListUI = document.getElementById('player-list'); // Đổi tên để tránh xung đột
    const rolesTotalDisplay = document.getElementById('roles-total');
    const playersTotalDisplay = document.getElementById('players-total');
    const sendRolesBtn = document.getElementById('send-roles-btn');
    const clearGamelogBtn = document.getElementById('clear-gamelog-btn');
    const deleteRoomBtn = document.getElementById('delete-room-btn');

    let currentRoomId = null;
    let playerListener = null;

    // --- Functions ---

    /**
     * MỚI: Cập nhật bộ đếm người chơi và vai trò, kiểm tra hợp lệ
     */
    const updateCounters = () => {
        const totalPlayers = document.querySelectorAll('input[name="selected-player"]:checked').length;
        
        const checkedRolesCount = document.querySelectorAll('input[name="selected-role"]:checked').length;
        const quantityInputs = document.querySelectorAll('input[name="quantity-role"]');
        let quantityCount = 0;
        quantityInputs.forEach(input => {
            quantityCount += parseInt(input.value) || 0;
        });
        const totalRoles = checkedRolesCount + quantityCount;

        roleCountDisplay.textContent = `Người chơi: ${totalPlayers} | Vai trò: ${totalRoles}`;
        
        if (totalPlayers === totalRoles && totalPlayers > 0) {
            roleCountDisplay.style.color = 'lime';
            createRoomBtn.disabled = false;
        } else {
            roleCountDisplay.style.color = 'red';
            createRoomBtn.disabled = true;
        }
    };

    /**
     * MỚI: Tải danh sách người chơi tổng từ Google Sheet
     */
    const loadPlayersFromSheet = async () => {
        try {
            const response = await fetch(`${API_ENDPOINT}?sheetName=Players`);
            if (!response.ok) throw new Error('Không thể tải danh sách người chơi.');
            const allPlayers = await response.json();
            
            playerListContainer.innerHTML = ''; // Xóa thông báo "đang tải"
            let playerHtml = '<div class="player-checkbox-grid">';
            allPlayers.forEach(player => {
                // Đảm bảo chỉ lấy người chơi có tên (Username)
                if (player.Username) { 
                    playerHtml += `<div class="player-checkbox-item">
                        <input type="checkbox" id="player-${player.Username}" name="selected-player" value="${player.Username}">
                        <label for="player-${player.Username}">${player.Username}</label>
                    </div>`;
                }
            });
            playerHtml += '</div>';
            playerListContainer.innerHTML = playerHtml;

        } catch (error) {
            console.error("Lỗi tải người chơi:", error);
            playerListContainer.innerHTML = `<p style='color:red;'>Lỗi tải danh sách người chơi.</p>`;
        }
    };

    /**
     * CHỈNH SỬA: Tải vai trò và ưu tiên Dân, Sói
     */
    const loadRolesFromSheet = async () => {
        try {
            const response = await fetch(`${API_ENDPOINT}?sheetName=Roles`);
            if (!response.ok) throw new Error('Không thể tải danh sách vai trò.');
            let allRolesFromSheet = await response.json();
            
            // Sắp xếp lại mảng, đưa Dân và Sói lên đầu
            allRolesFromSheet.sort((a, b) => {
                const aName = a.RoleName.toLowerCase();
                const bName = b.RoleName.toLowerCase();
                const priorityRoles = ['dân làng', 'dân', 'sói', 'sói thường', 'ma sói'];
                
                const aIsPriority = priorityRoles.includes(aName);
                const bIsPriority = priorityRoles.includes(bName);

                if (aIsPriority && !bIsPriority) return -1;
                if (!aIsPriority && bIsPriority) return 1;
                return 0;
            });

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
                    const roleNameLower = role.RoleName.toLowerCase();
                    const quantityRoles = ['dân làng', 'dân', 'sói', 'sói thường', 'ma sói'];
                    
                    if (quantityRoles.includes(roleNameLower)) {
                        factionHtml += `<div class="role-input-item">
                            <label for="role-${role.RoleName}">${role.RoleName}</label>
                            <input type="number" id="role-${role.RoleName}" name="quantity-role" data-role-name="${role.RoleName}" min="0" value="0" class="role-input">
                        </div>`;
                    } else {
                        factionHtml += `<div class="role-checkbox-item">
                            <input type="checkbox" id="role-${role.RoleName}" name="selected-role" value="${role.RoleName}" class="role-input">
                            <label for="role-${role.RoleName}">${role.RoleName}</label>
                        </div>`;
                    }
                });
                factionHtml += `</div>`;
                rolesByFactionContainer.innerHTML += factionHtml;
            }
            updateCounters(); // Cập nhật bộ đếm sau khi render
        } catch (error) {
            console.error("Lỗi tải vai trò:", error);
            rolesByFactionContainer.innerHTML = `<p style='color:red;'>Lỗi tải danh sách vai trò.</p>`;
        }
    };
    
    /**
     * CHỈNH SỬA: Logic tạo phòng với người chơi và vai trò đã chọn
     */
    const createRoom = () => {
        currentRoomId = `room-${Math.random().toString(36).substr(2, 6)}`;
        roomIdDisplay.textContent = currentRoomId;
        
        const selectedPlayerNodes = document.querySelectorAll('input[name="selected-player"]:checked');
        const selectedPlayers = Array.from(selectedPlayerNodes).map(node => node.value);
        
        let selectedRoles = [];
        document.querySelectorAll('input[name="selected-role"]:checked').forEach(node => selectedRoles.push(node.value));
        document.querySelectorAll('input[name="quantity-role"]').forEach(input => {
            const count = parseInt(input.value) || 0;
            for (let i = 0; i < count; i++) {
                selectedRoles.push(input.dataset.roleName);
            }
        });

        if (selectedRoles.length !== selectedPlayers.length) {
            alert('Số lượng vai trò không khớp với số lượng người chơi!');
            return;
        }

        const playersObject = {};
        selectedPlayers.forEach(playerName => {
            const playerId = `player_${playerName.replace(/\s+/g, '')}_${Math.random().toString(36).substr(2, 5)}`;
            playersObject[playerId] = { name: playerName, isAlive: true, role: '' };
        });
        
        database.ref(currentRoomId).set({
            totalPlayers: selectedPlayers.length,
            rolesToAssign: selectedRoles,
            players: playersObject,
            gameState: { status: 'setup', message: 'Quản trò đang phân vai...' }
        });

        setupSection.classList.add('hidden');
        activeRoomSection.classList.remove('hidden');
        
        rolesTotalDisplay.textContent = selectedRoles.length;
        rolesInGameList.innerHTML = '';
        selectedRoles.forEach(role => {
            rolesInGameList.innerHTML += `<li>${role}</li>`;
        });

        playersTotalDisplay.textContent = selectedPlayers.length;
        updatePlayerListUI(playersObject);
        
        listenForPlayerUpdates(currentRoomId);
    };

    const listenForPlayerUpdates = (roomId) => {
        const playersRef = database.ref(`${roomId}/players`);
        if (playerListener) playersRef.off('value', playerListener);
        
        playerListener = playersRef.on('value', (snapshot) => {
            const playersData = snapshot.val() || {};
            updatePlayerListUI(playersData);
        });
    };

    const updatePlayerListUI = (playersData) => {
        playerListUI.innerHTML = '';
        for (const playerId in playersData) {
            const player = playersData[playerId];
            const li = document.createElement('li');
            li.className = 'player-item';
            if (!player.isAlive) li.classList.add('dead');
            li.innerHTML = `<span class="player-name">${player.name} ${player.role ? `<strong>(${player.role})</strong>` : ''}</span>`;
            playerListUI.appendChild(li);
        }
    };

    const sendRoles = async () => {
        if (!currentRoomId) return;
        if (!confirm('Bạn có chắc muốn gửi vai trò và lưu log?')) return;

        const roomRef = database.ref(currentRoomId);
        const roomSnapshot = await roomRef.once('value');
        const roomData = roomSnapshot.val();

        if (!roomData || !roomData.players || !roomData.rolesToAssign) {
            alert("Lỗi: Không tìm thấy dữ liệu phòng.");
            return;
        }

        let allRoles = roomData.rolesToAssign;
        let playerIds = Object.keys(roomData.players);

        allRoles.sort(() => Math.random() - 0.5); // Xáo trộn vai trò

        const updates = {};
        playerIds.forEach((id, index) => {
            updates[`/players/${id}/role`] = allRoles[index] || 'Dân thường';
        });
        updates['/gameState/status'] = 'roles-sent';
        updates['/gameState/message'] = 'Quản trò đã gửi vai trò.';

        await roomRef.update(updates);
        
        const finalPlayersSnapshot = await database.ref(`${currentRoomId}/players`).once('value');
        const finalPlayers = finalPlayersSnapshot.val();
        
        const logPayload = Object.values(finalPlayers).map(p => ({ name: p.name, role: p.role }));
        try {
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

        sendRolesBtn.disabled = true;
    };

    const clearGameLog = async () => { /* ... giữ nguyên logic cũ ... */ };
    
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
        // Bỏ check tất cả người chơi và vai trò
        document.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
        document.querySelectorAll('input[type="number"]').forEach(num => num.value = 0);
        
        currentRoomId = null;
        roomIdDisplay.textContent = "Chưa tạo";
        activeRoomSection.classList.add('hidden');
        setupSection.classList.remove('hidden');
        playerListUI.innerHTML = '';
        rolesInGameList.innerHTML = '';
        playersTotalDisplay.textContent = '0';
        rolesTotalDisplay.textContent = '0';
        sendRolesBtn.disabled = false;
        updateCounters();
    };

    // --- Event Listeners ---
    createRoomBtn.addEventListener('click', createRoom);
    sendRolesBtn.addEventListener('click', sendRoles);
    clearGamelogBtn.addEventListener('click', clearGameLog);
    deleteRoomBtn.addEventListener('click', deleteRoom);
    
    // Gán sự kiện để gọi bộ đếm
    playerListContainer.addEventListener('change', updateCounters);
    rolesByFactionContainer.addEventListener('change', updateCounters);
    
    // Tải dữ liệu khi trang được mở
    loadPlayersFromSheet();
    loadRolesFromSheet();
});