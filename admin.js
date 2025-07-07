// =================================================================
// === admin.js - PHIÊN BẢN GIAO DIỆN NÂNG CAO ===
console.log("ĐANG CHẠY admin.js PHIÊN BẢN GIAO DIỆN NÂNG CAO!");
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
    
    // --- DOM Elements ---
    const setupSection = document.getElementById('setup-section');
    const activeRoomSection = document.getElementById('active-room-section');
    const createRoomBtn = document.getElementById('create-room-btn');
    const playerListContainer = document.getElementById('player-list-container');
    const roomIdDisplay = document.getElementById('room-id-display');
    const rolesByFactionContainer = document.getElementById('roles-by-faction');
    const roleCounterContainer = document.getElementById('role-counter-container');
    const playerCountEl = document.getElementById('player-count');
    const wolfPackCountEl = document.getElementById('wolf-pack-count');
    const villagerFactionCountEl = document.getElementById('villager-faction-count');
    const wolfFactionCountEl = document.getElementById('wolf-faction-count');
    const neutralFactionCountEl = document.getElementById('neutral-faction-count');
    const roleCountEl = document.getElementById('role-count');
    const rolesInGameList = document.getElementById('roles-in-game-list');
    const playerListUI = document.getElementById('player-list');
    const rolesTotalDisplay = document.getElementById('roles-total');
    const playersTotalDisplay = document.getElementById('players-total');
    const sendRolesBtn = document.getElementById('send-roles-btn');
    const clearGamelogBtn = document.getElementById('clear-gamelog-btn');
    const deleteRoomBtn = document.getElementById('delete-room-btn');

    // MỚI: DOM Elements cho quản lý phòng
    const roomListContainer = document.getElementById('room-list-container');
    const refreshRoomsBtn = document.getElementById('refresh-rooms-btn');

    let currentRoomId = null;
    let playerListener = null;
    let allRolesData = [];

    // =======================================================
    // === MỚI: LOGIC QUẢN LÝ PHÒNG ===
    // =======================================================
    const loadAndDisplayRooms = async () => {
        // Kiểm tra xem element có tồn tại trên trang không
        if (!roomListContainer) return; 
        roomListContainer.innerHTML = '<p>Đang tải danh sách phòng...</p>';
        try {
            const response = await fetch('/api/room');
            if (!response.ok) throw new Error(`Không thể tải danh sách phòng (${response.status})`);
            
            const rooms = await response.json();
            
            if (rooms.length === 0) {
                roomListContainer.innerHTML = '<p>Không có phòng nào đang hoạt động.</p>';
                return;
            }

            let roomListHTML = '<ul class="room-management-list">';
            rooms.forEach(room => {
                const creationTime = new Date(room.createdAt).toLocaleString('vi-VN');
                roomListHTML += `
                    <li class="room-list-item">
                        <span>
                            <strong>ID:</strong> ${room.id} <br>
                            <em>(Tạo lúc: ${creationTime}, ${room.playerCount} người chơi)</em>
                        </span>
                        <button class="btn-danger delete-room-btn" data-room-id="${room.id}">Xóa</button>
                    </li>
                `;
            });
            roomListHTML += '</ul>';
            roomListContainer.innerHTML = roomListHTML;
            
        } catch (error) {
            console.error("Lỗi tải phòng:", error);
            roomListContainer.innerHTML = `<p style='color:red;'>Lỗi: ${error.message}</p>`;
        }
    };
    
    const handleDeleteRoom = (roomId) => {
        if (!roomId || !confirm(`Bạn có chắc muốn xóa vĩnh viễn phòng '${roomId}'? Hành động này sẽ kick tất cả người chơi ra khỏi phòng.`)) return;
        
        database.ref(`rooms/${roomId}`).remove()
            .then(() => {
                alert(`Phòng '${roomId}' đã được xóa thành công.`);
                loadAndDisplayRooms(); // Tải lại danh sách ngay sau khi xóa
            })
            .catch((error) => {
                alert("Lỗi khi xóa phòng: " + error.message);
            });
    };

    // --- CÁC HÀM CŨ (GIỮ NGUYÊN) ---
    const updateCounters = () => {
        const totalPlayers = document.querySelectorAll('input[name="selected-player"]:checked').length;
        let selectedRoleNames = [];
        document.querySelectorAll('input[name="selected-role"]:checked').forEach(node => {
            selectedRoleNames.push(node.value);
        });
        document.querySelectorAll('input[name="quantity-role"]').forEach(input => {
            const count = parseInt(input.value) || 0;
            const roleName = input.dataset.roleName;
            for (let i = 0; i < count; i++) {
                selectedRoleNames.push(roleName);
            }
        });
        const totalRoles = selectedRoleNames.length;

        let counts = { wolfPack: 0, villagerFaction: 0, wolfFaction: 0, neutralFaction: 0 };
        selectedRoleNames.forEach(roleName => {
            const roleData = allRolesData.find(r => r.name === roleName);
            if (roleData) {
                if (roleName.toLowerCase().includes('sói')) counts.wolfPack++;
                switch (roleData.faction) {
                    case 'Phe Dân': counts.villagerFaction++; break;
                    case 'Phe Sói': counts.wolfFaction++; break;
                    case 'Phe Trung Lập': counts.neutralFaction++; break;
                }
            }
        });

        playerCountEl.textContent = totalPlayers;
        wolfPackCountEl.textContent = counts.wolfPack;
        villagerFactionCountEl.textContent = counts.villagerFaction;
        wolfFactionCountEl.textContent = counts.wolfFaction;
        neutralFactionCountEl.textContent = counts.neutralFaction;
        roleCountEl.textContent = totalRoles;
        
        if (totalPlayers === totalRoles && totalPlayers > 0) {
            roleCounterContainer.classList.add('valid');
            roleCounterContainer.classList.remove('invalid');
            createRoomBtn.disabled = false;
        } else {
            roleCounterContainer.classList.add('invalid');
            roleCounterContainer.classList.remove('valid');
            createRoomBtn.disabled = true;
        }
    };

    const loadPlayersFromSheet = async () => {
        try {
            const response = await fetch(`/api/sheets?sheetName=Players`);
            if (!response.ok) throw new Error('Không thể tải danh sách người chơi.');
            const allPlayers = await response.json();
            
            playerListContainer.innerHTML = '';
            let playerHtml = '<div class="player-checkbox-grid">';
            allPlayers.forEach(player => {
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

    const loadRolesFromSheet = async () => {
        try {
            const response = await fetch(`/api/sheets?sheetName=Roles`);
            if (!response.ok) throw new Error('Không thể tải danh sách vai trò.');
            const rawData = await response.json();
            
            allRolesData = rawData.map(role => ({
                name: role.RoleName || 'Tên vai trò lỗi',
                faction: role.Faction || 'Chưa phân loại',
                description: role.Description || 'Không có mô tả cho vai trò này.',
                image: role.ImageURL || ''
            }));
            
            allRolesData.sort((a, b) => {
                const aName = a.name.toLowerCase();
                const bName = b.name.toLowerCase();
                const priorityRoles = ['dân làng', 'dân', 'sói', 'sói thường', 'ma sói'];
                const aIsPriority = priorityRoles.includes(aName);
                const bIsPriority = priorityRoles.includes(bName);
                if (aIsPriority && !bIsPriority) return -1;
                if (!aIsPriority && bIsPriority) return 1;
                return 0;
            });

            const rolesByFaction = allRolesData.reduce((acc, role) => {
                const faction = role.faction || 'Chưa phân loại';
                if (!acc[faction]) acc[faction] = [];
                acc[faction].push(role);
                return acc;
            }, {});

            rolesByFactionContainer.innerHTML = '';
            for (const faction in rolesByFaction) {
                let factionHtml = `<h4>${faction}</h4><div class="role-checkbox-group">`;
                rolesByFaction[faction].forEach(role => {
                    const roleNameLower = role.name.toLowerCase();
                    const quantityRoles = ['dân làng', 'dân', 'sói', 'sói thường', 'ma sói'];
                    
                    if (quantityRoles.includes(roleNameLower)) {
                        factionHtml += `<div class="role-input-item">
                            <label for="role-${role.name}">${role.name}</label>
                            <input type="number" id="role-${role.name}" name="quantity-role" data-role-name="${role.name}" min="0" value="0" class="role-input">
                        </div>`;
                    } else {
                        factionHtml += `<div class="role-checkbox-item">
                            <input type="checkbox" id="role-${role.name}" name="selected-role" value="${role.name}" class="role-input">
                            <label for="role-${role.name}">${role.name}</label>
                        </div>`;
                    }
                });
                factionHtml += `</div>`;
                rolesByFactionContainer.innerHTML += factionHtml;
            }
            updateCounters();
        } catch (error) {
            console.error("Lỗi tải vai trò:", error);
            rolesByFactionContainer.innerHTML = `<p style='color:red;'>Lỗi tải danh sách vai trò.</p>`;
        }
    };
    
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
            playersObject[playerId] = { name: playerName, isAlive: true, role: null };
        });
        
        database.ref(`rooms/${currentRoomId}`).set({
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            totalPlayers: selectedPlayers.length,
            rolesToAssign: selectedRoles,
            players: playersObject,
            gameState: { status: 'setup', message: 'Quản trò đang phân vai...' }
        }).then(() => {
            alert(`Phòng ${currentRoomId} đã được tạo thành công!`);
            loadAndDisplayRooms(); // Tải lại danh sách phòng sau khi tạo
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
        const playersRef = database.ref(`rooms/${roomId}/players`);
        if (playerListener) playersRef.off('value', playerListener);
        playerListener = playersRef.on('value', (snapshot) => {
            updatePlayerListUI(snapshot.val() || {});
        });
    };

    const updatePlayerListUI = (playersData) => {
        playerListUI.innerHTML = '';
        if (!playersData) return;
        for (const playerId in playersData) {
            const player = playersData[playerId];
            const roleName = (player.role && player.role.name) ? `<strong>(${player.role.name})</strong>` : '';
            const li = document.createElement('li');
            li.className = 'player-item';
            if (!player.isAlive) li.classList.add('dead');
            li.innerHTML = `<span class="player-name">${player.name} ${roleName}</span>`;
            playerListUI.appendChild(li);
        }
    };

    const sendRoles = async () => {
        if (!currentRoomId) return;
        if (!confirm('Bạn có chắc muốn gửi vai trò và lưu log?')) return;

        sendRolesBtn.disabled = true;
        sendRolesBtn.textContent = 'Đang gửi...';

        try {
            const roomRef = database.ref(`rooms/${currentRoomId}`);
            const roomSnapshot = await roomRef.once('value');
            const roomData = roomSnapshot.val();

            if (!roomData || !roomData.players || !roomData.rolesToAssign) {
                throw new Error("Lỗi: Không tìm thấy dữ liệu phòng.");
            }

            let rolesToAssign = [...roomData.rolesToAssign];
            let playerIds = Object.keys(roomData.players);

            rolesToAssign.sort(() => Math.random() - 0.5);
            playerIds.sort(() => Math.random() - 0.5);

            const updates = {};
            const logPayload = [];

            playerIds.forEach((id, index) => {
                const assignedRoleName = rolesToAssign[index];
                let assignedRoleData = allRolesData.find(r => r.name === assignedRoleName);

                if (!assignedRoleData) {
                    assignedRoleData = { name: "Dân Làng", faction: "Phe Dân", description: "Không có chức năng đặc biệt.", image: "" };
                }
                
                updates[`/players/${id}/role`] = assignedRoleData;
                logPayload.push({ name: roomData.players[id].name, role: assignedRoleData.name });
            });

            updates['/gameState/status'] = 'roles-sent';
            updates['/gameState/message'] = 'Quản trò đã gửi vai trò.';
            
            await roomRef.update(updates);
            
            await fetch(`/api/sheets`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'saveGameLog', payload: logPayload })
            });

            alert('Đã gửi vai trò và lưu vào Google Sheet!');
            sendRolesBtn.textContent = 'Đã Gửi';

        } catch (error) {
            console.error("Lỗi nghiêm trọng khi gửi vai trò:", error);
            alert("Lỗi nghiêm trọng: " + error.message);
            sendRolesBtn.disabled = false;
            sendRolesBtn.textContent = 'Gửi Vai Trò & Lưu Log';
        }
    };

    const clearGameLog = async () => {
        if (!currentRoomId || !confirm('Bạn có chắc muốn xóa log và reset vai trò của tất cả người chơi trong phòng này?')) return;

        try {
            await fetch(`/api/sheets`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'clearGameLog' })
            });

            const playersRef = database.ref(`rooms/${currentRoomId}/players`);
            const snapshot = await playersRef.once('value');
            const players = snapshot.val();

            if (players) {
                const updates = {};
                for (const playerId in players) {
                    updates[`/${playerId}/role`] = null;
                }
                await playersRef.update(updates);
            }
            
            await database.ref(`rooms/${currentRoomId}/gameState`).update({
                status: 'setup',
                message: 'Quản trò đã reset game.'
            });
            
            sendRolesBtn.disabled = false;
            sendRolesBtn.textContent = 'Gửi Vai Trò & Lưu Log';
            alert('Đã xóa log trên Google Sheet và reset vai trò người chơi thành công!');

        } catch (error) {
            console.error('Lỗi khi xóa log và reset game:', error);
            alert('Có lỗi xảy ra: ' + error.message);
        }
    };
    
    const deleteRoom = () => {
        if (!currentRoomId || !confirm(`Bạn có chắc muốn xóa vĩnh viễn phòng '${currentRoomId}'?`)) return;
        if (playerListener) {
            database.ref(`rooms/${currentRoomId}/players`).off('value', playerListener);
            playerListener = null;
        }
        database.ref(`rooms/${currentRoomId}`).remove()
            .then(() => {
                alert(`Phòng '${currentRoomId}' đã được xóa.`);
                resetAdminUI();
            })
            .catch((error) => alert("Lỗi khi xóa phòng: " + error.message));
    };

    const resetAdminUI = () => {
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
        sendRolesBtn.textContent = 'Gửi Vai Trò & Lưu Log';
        updateCounters();
    };

    // --- EVENT LISTENERS ---
    createRoomBtn.addEventListener('click', createRoom);
    sendRolesBtn.addEventListener('click', sendRoles);
    clearGamelogBtn.addEventListener('click', clearGameLog);
    deleteRoomBtn.addEventListener('click', deleteRoom);
    playerListContainer.addEventListener('change', updateCounters);
    rolesByFactionContainer.addEventListener('change', updateCounters);
    
    // MỚI: Event listener cho quản lý phòng
    if(refreshRoomsBtn) refreshRoomsBtn.addEventListener('click', loadAndDisplayRooms);
    if(roomListContainer) roomListContainer.addEventListener('click', (event) => {
        if (event.target.classList.contains('delete-room-btn')) {
            handleDeleteRoom(event.target.dataset.roomId);
        }
    });
    
    // --- TẢI DỮ LIỆU BAN ĐẦU ---
    loadPlayersFromSheet();
    loadRolesFromSheet();
    loadAndDisplayRooms(); // Tải danh sách phòng ngay khi mở trang
});