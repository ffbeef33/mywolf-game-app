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
    
    const API_ENDPOINT = "/api/sheets"; 

    // --- DOM Elements ---
    const setupSection = document.getElementById('setup-section');
    const activeRoomSection = document.getElementById('active-room-section');
    const createRoomBtn = document.getElementById('create-room-btn');
    const playerListContainer = document.getElementById('player-list-container');
    const roomIdDisplay = document.getElementById('room-id-display');
    const rolesByFactionContainer = document.getElementById('roles-by-faction');
    const roleCounterContainer = document.getElementById('role-counter-container');
    // Bộ đếm chi tiết
    const playerCountEl = document.getElementById('player-count');
    const wolfPackCountEl = document.getElementById('wolf-pack-count');
    const villagerFactionCountEl = document.getElementById('villager-faction-count');
    const wolfFactionCountEl = document.getElementById('wolf-faction-count');
    const neutralFactionCountEl = document.getElementById('neutral-faction-count');
    const roleCountEl = document.getElementById('role-count');
    // Các elements khác
    const rolesInGameList = document.getElementById('roles-in-game-list');
    const playerListUI = document.getElementById('player-list');
    const rolesTotalDisplay = document.getElementById('roles-total');
    const playersTotalDisplay = document.getElementById('players-total');
    const sendRolesBtn = document.getElementById('send-roles-btn');
    const clearGamelogBtn = document.getElementById('clear-gamelog-btn');
    const deleteRoomBtn = document.getElementById('delete-room-btn');

    let currentRoomId = null;
    let playerListener = null;
    let allRolesData = []; // Biến lưu trữ toàn bộ dữ liệu vai trò để tra cứu

    // --- Functions ---

    /**
     * NÂNG CẤP: Bộ đếm chi tiết với các phe phái
     */
    const updateCounters = () => {
        const totalPlayers = document.querySelectorAll('input[name="selected-player"]:checked').length;

        // Lấy danh sách tên tất cả các vai trò đã chọn
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

        // Bắt đầu đếm phe phái và bầy sói
        let counts = {
            wolfPack: 0,
            villagerFaction: 0,
            wolfFaction: 0,
            neutralFaction: 0,
        };

        selectedRoleNames.forEach(roleName => {
            // Tìm thông tin đầy đủ của vai trò từ dữ liệu đã lưu
            const roleData = allRolesData.find(r => r.RoleName === roleName);
            if (roleData) {
                // Đếm bầy sói (bất kỳ vai trò nào có chữ "Sói")
                if (roleName.toLowerCase().includes('sói')) {
                    counts.wolfPack++;
                }
                // Đếm phe dựa trên cột "Faction"
                switch (roleData.Faction) {
                    case 'Phe Dân':
                        counts.villagerFaction++;
                        break;
                    case 'Phe Sói':
                        counts.wolfFaction++;
                        break;
                    case 'Phe Trung Lập':
                        counts.neutralFaction++;
                        break;
                }
            }
        });

        // Cập nhật giao diện bộ đếm
        playerCountEl.textContent = totalPlayers;
        wolfPackCountEl.textContent = counts.wolfPack;
        villagerFactionCountEl.textContent = counts.villagerFaction;
        wolfFactionCountEl.textContent = counts.wolfFaction;
        neutralFactionCountEl.textContent = counts.neutralFaction;
        roleCountEl.textContent = totalRoles;
        
        // Kiểm tra hợp lệ và đổi màu viền
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

    /**
     * MỚI: Tải danh sách người chơi tổng từ Google Sheet
     */
    const loadPlayersFromSheet = async () => {
        try {
            const response = await fetch(`${API_ENDPOINT}?sheetName=Players`);
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

    /**
     * CHỈNH SỬA: Tải vai trò, lưu vào biến toàn cục và ưu tiên Dân, Sói
     */
    const loadRolesFromSheet = async () => {
        try {
            const response = await fetch(`${API_ENDPOINT}?sheetName=Roles`);
            if (!response.ok) throw new Error('Không thể tải danh sách vai trò.');
            allRolesData = await response.json(); // Lưu dữ liệu vào biến toàn cục
            
            allRolesData.sort((a, b) => {
                const aName = a.RoleName.toLowerCase();
                const bName = b.RoleName.toLowerCase();
                const priorityRoles = ['dân làng', 'dân', 'sói', 'sói thường', 'ma sói'];
                
                const aIsPriority = priorityRoles.includes(aName);
                const bIsPriority = priorityRoles.includes(bName);

                if (aIsPriority && !bIsPriority) return -1;
                if (!aIsPriority && bIsPriority) return 1;
                return 0;
            });

            const rolesByFaction = allRolesData.reduce((acc, role) => {
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
            updateCounters();
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

        allRoles.sort(() => Math.random() - 0.5);

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

    const clearGameLog = async () => {
        if (!confirm('Bạn có chắc muốn xóa log game?')) return;
        try {
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
    
    playerListContainer.addEventListener('change', updateCounters);
    rolesByFactionContainer.addEventListener('change', updateCounters);
    
    // Tải dữ liệu khi trang được mở
    loadPlayersFromSheet();
    loadRolesFromSheet();
});