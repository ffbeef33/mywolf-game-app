// =================================================================
// === admin.js - PHIÊN BẢN CÓ BỘ ĐẾM VAI TRÒ ===
console.log("ĐANG CHẠY admin.js PHIÊN BẢN CÓ BỘ ĐẾM VAI TRÒ!");
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
    const totalPlayersInput = document.getElementById('total-players'); // Thêm mới
    const roomIdDisplay = document.getElementById('room-id-display');
    const rolesByFactionContainer = document.getElementById('roles-by-faction');
    const roleCountDisplay = document.getElementById('role-count-display'); // Thêm mới
    const rolesInGameList = document.getElementById('roles-in-game-list');
    const playerList = document.getElementById('player-list');
    const playersJoinedDisplay = document.getElementById('players-joined');
    const playersTotalDisplay = document.getElementById('players-total');
    const sendRolesBtn = document.getElementById('send-roles-btn');
    const clearGamelogBtn = document.getElementById('clear-gamelog-btn');
    const deleteRoomBtn = document.getElementById('delete-room-btn');

    let currentRoomId = null;
    let players = {};
    let playerListener = null;

    // --- Functions ---

    /**
     * MỚI: Cập nhật bộ đếm vai trò và kiểm tra hợp lệ
     */
    const updateSelectedRolesCount = () => {
        const totalPlayers = parseInt(totalPlayersInput.value) || 0;

        // Đếm các vai trò được check (checkbox)
        const checkedRolesCount = document.querySelectorAll('input[name="selected-role"]:checked').length;
        
        // Đếm các vai trò có số lượng (number input)
        const quantityInputs = document.querySelectorAll('input[name="quantity-role"]');
        let quantityCount = 0;
        quantityInputs.forEach(input => {
            quantityCount += parseInt(input.value) || 0;
        });

        const totalSelected = checkedRolesCount + quantityCount;

        // Cập nhật giao diện bộ đếm
        if (roleCountDisplay) {
            roleCountDisplay.textContent = `Đã chọn: ${totalSelected} / ${totalPlayers} vai trò`;
            
            if (totalSelected === totalPlayers && totalSelected > 0) {
                roleCountDisplay.style.color = 'lime';
                createRoomBtn.disabled = false;
            } else {
                roleCountDisplay.style.color = 'red';
                createRoomBtn.disabled = true;
            }
        }
    };

    /**
     * CHỈNH SỬA: Tải và render vai trò, có phân biệt loại input
     */
    const loadRolesFromSheet = async () => {
        try {
            // Lưu ý: API Route của chúng ta không cần tham số `action`
            const response = await fetch(API_ENDPOINT); 
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
            // Cập nhật bộ đếm lần đầu sau khi render
            updateSelectedRolesCount();
        } catch (error) {
            console.error("Lỗi nghiêm trọng khi tải vai trò:", error);
            rolesByFactionContainer.innerHTML = `<p style='color:red;'>Lỗi tải vai trò: ${error.message}.</p>`;
        }
    };
    
    /**
     * CHỈNH SỬA: Logic tạo phòng để đọc đúng các vai trò đã chọn
     */
    const createRoom = () => {
        currentRoomId = `room-${Math.random().toString(36).substr(2, 6)}`;
        roomIdDisplay.textContent = currentRoomId;
        
        const totalPlayers = parseInt(totalPlayersInput.value);
        let selectedRoles = [];

        // Lấy vai trò từ checkbox
        document.querySelectorAll('input[name="selected-role"]:checked').forEach(node => {
            selectedRoles.push(node.value);
        });

        // Lấy vai trò từ ô số lượng
        document.querySelectorAll('input[name="quantity-role"]').forEach(input => {
            const count = parseInt(input.value) || 0;
            const roleName = input.dataset.roleName;
            for (let i = 0; i < count; i++) {
                selectedRoles.push(roleName);
            }
        });

        // Kiểm tra lại lần cuối trước khi tạo
        if (selectedRoles.length !== totalPlayers) {
            alert('Số lượng vai trò đã chọn không khớp với tổng số người chơi!');
            return;
        }
        
        // Lưu vào Firebase
        database.ref(currentRoomId).set({
            totalPlayers: totalPlayers,
            rolesToAssign: selectedRoles,
            players: {},
            gameState: { status: 'waiting', message: 'Chờ người chơi tham gia...' }
        });

        // Cập nhật giao diện
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

    // Các hàm còn lại giữ nguyên logic
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
    
    const listenForPlayers = (roomId) => {
        const playersRef = database.ref(`${roomId}/players`);
        if (playerListener) playersRef.off('value', playerListener);
        playerListener = playersRef.on('value', (snapshot) => {
            players = snapshot.val() || {};
            updatePlayerListUI(players);
            const playerCount = Object.keys(players).length;
            playersJoinedDisplay.textContent = playerCount;
            sendRolesBtn.disabled = playerCount !== parseInt(totalPlayersInput.value);
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
        // totalPlayers = 0; // Không reset totalPlayers để giữ lại giá trị người dùng nhập
        roomIdDisplay.textContent = "Chưa tạo";
        activeRoomSection.classList.add('hidden');
        setupSection.classList.remove('hidden');
        playerList.innerHTML = '';
        rolesInGameList.innerHTML = '';
        playersJoinedDisplay.textContent = '0';
        playersTotalDisplay.textContent = '0';
        updateSelectedRolesCount(); // Cập nhật lại bộ đếm khi reset
    };

    // --- Event Listeners ---
    createRoomBtn.addEventListener('click', createRoom);
    sendRolesBtn.addEventListener('click', sendRoles);
    clearGamelogBtn.addEventListener('click', clearGameLog);
    deleteRoomBtn.addEventListener('click', deleteRoom);
    
    // THÊM MỚI: Gán sự kiện để gọi bộ đếm
    totalPlayersInput.addEventListener('input', updateSelectedRolesCount);
    // Lắng nghe mọi thay đổi (click checkbox, gõ số) trong container vai trò
    rolesByFactionContainer.addEventListener('change', updateSelectedRolesCount);
    
    // Tải vai trò khi trang được mở
    loadRolesFromSheet();
});