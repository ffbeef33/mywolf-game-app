// =================================================================
// === admin.js - PHIÊN BẢN SỬA LỖI CUỐI CÙNG TẠI CREATE ROOM ===
console.log("ĐANG CHẠY admin.js PHIÊN BẢN SỬA LỖI CUỐI CÙNG!");
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
    
    // --- DOM Elements (giữ nguyên) ---
    const setupSection = document.getElementById('setup-section');
    const activeRoomSection = document.getElementById('active-room-section');
    const playerPickMonitoringSection = document.getElementById('player-pick-monitoring-section');
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
    const startNormalRandomBtn = document.getElementById('start-normal-random-btn');
    const startPlayerPickBtn = document.getElementById('start-player-pick-btn');
    const playerPickTimerInput = document.getElementById('player-pick-timer');
    const clearGamelogBtn = document.getElementById('clear-gamelog-btn');
    const deleteRoomBtn = document.getElementById('delete-room-btn');
    const roomListContainer = document.getElementById('room-list-container');
    const refreshRoomsBtn = document.getElementById('refresh-rooms-btn');
    const backToSetupBtn = document.getElementById('back-to-setup-btn');
    const monitorTimerDisplay = document.getElementById('monitor-timer-display');
    const playerChoicesList = document.getElementById('player-choices-list');
    const processPlayerPickBtn = document.getElementById('process-player-pick-btn');

    let currentRoomId = null;
    let roomListener = null;
    let pickTimerInterval = null;
    let allRolesData = [];

    // Các hàm khác giữ nguyên, chỉ sửa hàm createRoom
    const processPlayerPick = async () => {
        if (!currentRoomId) return;
        if (!confirm('Bạn có chắc muốn xử lý và phân phối vai trò? Hành động này không thể hoàn tác.')) return;

        processPlayerPickBtn.disabled = true;
        processPlayerPickBtn.textContent = 'Đang xử lý...';

        try {
            const roomRef = database.ref(`rooms/${currentRoomId}`);
            const snapshot = await roomRef.once('value');
            const roomData = snapshot.val();

            if (!roomData || !roomData.playerPickState) {
                throw new Error("Không tìm thấy dữ liệu Player Pick để xử lý.");
            }

            let playerChoices = roomData.playerPickState.playerChoices;
            const choiceUpdates = {};
            Object.keys(playerChoices).forEach(playerName => {
                if (playerChoices[playerName] === 'waiting') {
                    playerChoices[playerName] = 'random';
                    choiceUpdates[`/playerPickState/playerChoices/${playerName}`] = 'random';
                }
            });
            if (Object.keys(choiceUpdates).length > 0) {
                 await roomRef.update(choiceUpdates);
            }

            const choiceCounts = Object.values(playerChoices).reduce((acc, choice) => {
                if (choice !== 'random') acc[choice] = (acc[choice] || 0) + 1;
                return acc;
            }, {});

            let assignedPlayers = {};
            let remainingRoles = [...roomData.rolesToAssign];
            let remainingPlayers = Object.values(roomData.players).map(p => p.name);

            Object.keys(choiceCounts).forEach(roleName => {
                if (choiceCounts[roleName] === 1) {
                    const luckyPlayer = Object.keys(playerChoices).find(p => playerChoices[p] === roleName);
                    assignedPlayers[luckyPlayer] = roleName;
                    remainingPlayers = remainingPlayers.filter(p => p !== luckyPlayer);
                    const roleIndex = remainingRoles.indexOf(roleName);
                    if (roleIndex > -1) remainingRoles.splice(roleIndex, 1);
                }
            });

            remainingRoles.sort(() => Math.random() - 0.5);
            remainingPlayers.forEach((playerName, index) => {
                assignedPlayers[playerName] = remainingRoles[index];
            });

            const finalUpdates = {};
            const logPayload = [];
            const playerMap = roomData.players;

            Object.keys(playerMap).forEach(playerId => {
                const playerName = playerMap[playerId].name;
                const finalRoleName = assignedPlayers[playerName];
                const finalRoleData = allRolesData.find(r => r.name === finalRoleName) || { name: "Lỗi", faction: "Lỗi", description: "Vai trò không xác định" };
                
                finalUpdates[`/players/${playerId}/role`] = finalRoleData;
                logPayload.push({ name: playerName, role: finalRoleName });
            });

            finalUpdates['/gameState/status'] = 'roles-sent';
            finalUpdates['/gameState/message'] = 'Quản trò đã gửi vai trò (Player Pick).';
            finalUpdates['/playerPickState/status'] = 'complete';

            await roomRef.update(finalUpdates);
            
            await fetch(`/api/sheets`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'saveGameLog', payload: logPayload })
            });

            alert('Phân phối vai trò hoàn tất!');

        } catch (error) {
            console.error("Lỗi nghiêm trọng khi xử lý Player Pick:", error);
            alert("Lỗi nghiêm trọng: " + error.message);
            processPlayerPickBtn.disabled = false;
            processPlayerPickBtn.textContent = 'Xử Lý & Phân Phối Vai Trò';
        }
    };

    const startPlayerPick = async () => {
        if (!currentRoomId) return;
        if (!confirm('Bạn có chắc muốn bắt đầu chế độ "Player Pick"? Người chơi sẽ bắt đầu chọn vai trò.')) return;

        try {
            const roomRef = database.ref(`rooms/${currentRoomId}`);
            const snapshot = await roomRef.once('value');
            const roomData = snapshot.val();

            if (!roomData || !roomData.players || !roomData.rolesToAssign) {
                throw new Error("Dữ liệu phòng không hợp lệ để bắt đầu.");
            }

            const availableRolesForPicking = roomData.rolesToAssign.map(roleName => {
                return allRolesData.find(r => r.name === roleName);
            }).filter(roleData => 
                roleData && (roleData.faction.trim() === 'Phe Dân' || roleData.faction.trim() === 'Phe trung lập')
            ).map(roleData => roleData.name);
            
            if (availableRolesForPicking.length === 0) {
                alert("Lỗi: Không có vai trò nào thuộc 'Phe Dân' hoặc 'Phe trung lập' trong danh sách để người chơi lựa chọn.");
                return;
            }

            const playerChoices = {};
            Object.values(roomData.players).forEach(player => {
                playerChoices[player.name] = "waiting"; 
            });

            const timerSeconds = parseInt(playerPickTimerInput.value, 10) || 60;
            const endTime = Date.now() + timerSeconds * 1000;

            const playerPickState = {
                status: 'picking',
                endTime: endTime,
                availableRoles: availableRolesForPicking,
                playerChoices: playerChoices
            };
            
            await roomRef.child('playerPickState').set(playerPickState);
            alert(`Đã bắt đầu chế độ Player Pick! Người chơi có ${timerSeconds} giây để chọn.`);
        } catch (error) {
            console.error("Lỗi khi bắt đầu Player Pick:", error);
            alert("Lỗi: " + error.message);
        }
    };

    const startNormalRandom = async () => {
        if (!currentRoomId) return;
        if (!confirm('Bạn có chắc muốn gửi vai trò NGẪU NHIÊN và lưu log?')) return;

        startNormalRandomBtn.disabled = true;
        startPlayerPickBtn.disabled = true;
        startNormalRandomBtn.textContent = 'Đang gửi...';

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
                let assignedRoleData = allRolesData.find(r => r.name === assignedRoleName) || { name: "Dân Làng", faction: "Phe Dân", description: "Không có chức năng đặc biệt.", image: "" };
                updates[`/players/${id}/role`] = assignedRoleData;
                logPayload.push({ name: roomData.players[id].name, role: assignedRoleData.name });
            });

            updates['/gameState/status'] = 'roles-sent';
            updates['/gameState/message'] = 'Quản trò đã gửi vai trò (Random).';
            
            await roomRef.update(updates);
            
            await fetch(`/api/sheets`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'saveGameLog', payload: logPayload })
            });

            alert('Đã gửi vai trò và lưu vào Google Sheet!');
            startNormalRandomBtn.textContent = 'Đã Gửi';

        } catch (error) {
            console.error("Lỗi nghiêm trọng khi gửi vai trò:", error);
            alert("Lỗi nghiêm trọng: " + error.message);
            startNormalRandomBtn.disabled = false;
            startPlayerPickBtn.disabled = false;
            startNormalRandomBtn.textContent = 'Bắt Đầu Random Ngẫu Nhiên';
        }
    };
    
    const loadRoomForManagement = async (roomId) => {
        const roomRef = database.ref(`rooms/${roomId}`);
        if (roomListener) roomListener.off();

        roomListener = roomRef.on('value', (snapshot) => {
            const roomData = snapshot.val();
            if (!roomData) {
                alert("Phòng không còn tồn tại. Quay lại màn hình chính.");
                resetAdminUI();
                return;
            }
            
            currentRoomId = roomId;
            roomIdDisplay.textContent = currentRoomId;

            const pickState = roomData.playerPickState;

            if (pickState && pickState.status === 'picking') {
                setupSection.classList.add('hidden');
                activeRoomSection.classList.add('hidden');
                playerPickMonitoringSection.classList.remove('hidden');
                updateMonitoringUI(pickState);
            } else {
                setupSection.classList.add('hidden');
                playerPickMonitoringSection.classList.add('hidden');
                activeRoomSection.classList.remove('hidden');
                updateActiveRoomUI(roomData);
            }
        });
    };

    const updateActiveRoomUI = (roomData) => {
        const rolesInGame = roomData.rolesToAssign || [];
        rolesTotalDisplay.textContent = rolesInGame.length;
        rolesInGameList.innerHTML = rolesInGame.map(role => `<li>${role}</li>`).join('');

        const playersInGame = roomData.players || {};
        playersTotalDisplay.textContent = Object.keys(playersInGame).length;
        updatePlayerListUI(playersInGame);

        const rolesSent = roomData.gameState?.status === 'roles-sent';
        startNormalRandomBtn.disabled = rolesSent;
        startPlayerPickBtn.disabled = rolesSent;
        startNormalRandomBtn.textContent = rolesSent ? 'Đã Gửi' : 'Bắt Đầu Random Ngẫu Nhiên';
    };

    const updateMonitoringUI = (pickState) => {
        if (pickTimerInterval) clearInterval(pickTimerInterval);
        
        const updateTimer = () => {
            const remaining = Math.round((pickState.endTime - Date.now()) / 1000);
            if (remaining >= 0) {
                monitorTimerDisplay.textContent = `${remaining}s`;
                processPlayerPickBtn.disabled = true;
            } else {
                monitorTimerDisplay.textContent = "Hết giờ!";
                processPlayerPickBtn.disabled = false;
                clearInterval(pickTimerInterval);
            }
        };
        updateTimer();
        pickTimerInterval = setInterval(updateTimer, 1000);

        playerChoicesList.innerHTML = '';
        const choices = pickState.playerChoices || {};
        Object.keys(choices).sort().forEach(playerName => {
            const choice = choices[playerName];
            let statusClass = 'waiting';
            let statusText = 'Đang chờ...';
            if (choice === 'random') {
                statusClass = 'random';
                statusText = 'Chọn Random';
            } else if (choice !== 'waiting') {
                statusClass = 'chosen';
                statusText = `Chọn: ${choice}`;
            }
            const li = document.createElement('li');
            li.innerHTML = `${playerName} <span class="choice-status ${statusClass}">${statusText}</span>`;
            playerChoicesList.appendChild(li);
        });
    };
    
    const loadAndDisplayRooms = async () => {
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
                roomListHTML += `<li class="room-list-item"><div class="room-info"><strong>ID:</strong> ${room.id} <br><em>(Tạo lúc: ${creationTime}, ${room.playerCount} người chơi)</em></div><div class="room-actions"><button class="btn-primary manage-room-btn" data-room-id="${room.id}">Quản Lý</button><button class="btn-danger delete-room-btn" data-room-id="${room.id}">Xóa</button></div></li>`;
            });
            roomListHTML += '</ul>';
            roomListContainer.innerHTML = roomListHTML;
        } catch (error) {
            console.error("Lỗi tải phòng:", error);
            roomListContainer.innerHTML = `<p style='color:red;'>Lỗi: ${error.message}</p>`;
        }
    };
    
    const handleDeleteRoomFromList = (roomId) => {
        if (!roomId || !confirm(`Bạn có chắc muốn xóa vĩnh viễn phòng '${roomId}'?`)) return;
        database.ref(`rooms/${roomId}`).remove()
            .then(() => {
                alert(`Phòng '${roomId}' đã được xóa thành công.`);
                loadAndDisplayRooms(); 
                if (currentRoomId === roomId) resetAdminUI();
            })
            .catch((error) => alert("Lỗi khi xóa phòng: " + error.message));
    };
    
    const updateCounters = () => {
        const totalPlayers = document.querySelectorAll('input[name="selected-player"]:checked').length;
        let selectedRoleNames = [];
        document.querySelectorAll('input[name="selected-role"]:checked').forEach(node => selectedRoleNames.push(node.value));
        document.querySelectorAll('input[name="quantity-role"]').forEach(input => {
            const count = parseInt(input.value) || 0;
            const roleName = input.dataset.roleName;
            for (let i = 0; i < count; i++) selectedRoleNames.push(roleName);
        });
        const totalRoles = selectedRoleNames.length;
        let counts = { wolfPack: 0, villagerFaction: 0, wolfFaction: 0, neutralFaction: 0 };
        selectedRoleNames.forEach(roleName => {
            const roleData = allRolesData.find(r => r.name === roleName);
            if (roleData) {
                if (roleName.toLowerCase().includes('sói')) counts.wolfPack++;
                switch (roleData.faction.trim()) {
                    case 'Phe Dân': counts.villagerFaction++; break;
                    case 'Phe Sói': counts.wolfFaction++; break;
                    case 'Phe trung lập': counts.neutralFaction++; break;
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
                    playerHtml += `<div class="player-checkbox-item"><input type="checkbox" id="player-${player.Username}" name="selected-player" value="${player.Username}"><label for="player-${player.Username}">${player.Username}</label></div>`;
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
                        factionHtml += `<div class="role-input-item"><label for="role-${role.name}">${role.name}</label><input type="number" id="role-${role.name}" name="quantity-role" data-role-name="${role.name}" min="0" value="0" class="role-input"></div>`;
                    } else {
                        factionHtml += `<div class="role-checkbox-item"><input type="checkbox" id="role-${role.name}" name="selected-role" value="${role.name}" class="role-input"><label for="role-${role.name}">${role.name}</label></div>`;
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

    // *** HÀM ĐÃ ĐƯỢC SỬA LỖI ***
    const createRoom = () => {
        const newRoomId = `room-${Math.random().toString(36).substr(2, 6)}`;
        const selectedPlayerNodes = document.querySelectorAll('input[name="selected-player"]:checked');
        const selectedPlayers = Array.from(selectedPlayerNodes).map(node => node.value);

        // *** LOGIC SỬA LỖI: Lấy vai trò từ CẢ checkbox VÀ ô nhập số ***
        let selectedRoles = [];
        // Lấy từ checkbox (Phe Sói, Phe trung lập, etc.)
        document.querySelectorAll('input[name="selected-role"]:checked').forEach(node => {
            selectedRoles.push(node.value);
        });
        // Lấy từ ô nhập số (Phe Dân, Sói thường, etc.)
        document.querySelectorAll('input[name="quantity-role"]').forEach(input => {
            const count = parseInt(input.value) || 0;
            const roleName = input.dataset.roleName;
            for (let i = 0; i < count; i++) {
                selectedRoles.push(roleName);
            }
        });

        if (selectedPlayers.length === 0) {
            alert('Vui lòng chọn ít nhất một người chơi.');
            return;
        }
        if (selectedRoles.length === 0) {
            alert('Vui lòng chọn ít nhất một vai trò.');
            return;
        }
        if (selectedRoles.length !== selectedPlayers.length) {
            alert(`Số lượng vai trò (${selectedRoles.length}) không khớp với số lượng người chơi (${selectedPlayers.length})!`);
            return;
        }

        const playersObject = {};
        selectedPlayers.forEach(playerName => {
            const playerId = `player_${playerName.replace(/\s+/g, '')}_${Math.random().toString(36).substr(2, 5)}`;
            playersObject[playerId] = { name: playerName, isAlive: true, role: null };
        });

        database.ref(`rooms/${newRoomId}`).set({
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            totalPlayers: selectedPlayers.length,
            rolesToAssign: selectedRoles, // Mảng vai trò đầy đủ sẽ được lưu tại đây
            players: playersObject,
            gameState: { status: 'setup', message: 'Quản trò đang phân vai...' }
        }).then(() => {
            alert(`Phòng ${newRoomId} đã được tạo thành công!`);
            loadAndDisplayRooms();
            loadRoomForManagement(newRoomId);
        }).catch(error => {
            console.error("Lỗi khi tạo phòng:", error);
            alert("Đã có lỗi xảy ra khi tạo phòng. Vui lòng xem console log.");
        });
    };
    
    const updatePlayerListUI = (playersData) => {
        playerListUI.innerHTML = '';
        if (!playersData) return;
        Object.values(playersData).sort((a,b) => a.name.localeCompare(b.name)).forEach(player => {
            const roleName = (player.role && player.role.name) ? `<strong>(${player.role.name})</strong>` : '';
            const li = document.createElement('li');
            li.className = 'player-item';
            if (!player.isAlive) li.classList.add('dead');
            li.innerHTML = `<span class="player-name">${player.name} ${roleName}</span>`;
            playerListUI.appendChild(li);
        });
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
                for (const playerId in players) updates[`/${playerId}/role`] = null;
                await playersRef.update(updates);
            }
            const roomUpdates = {
                '/gameState/status': 'setup',
                '/gameState/message': 'Quản trò đã reset game.',
                '/playerPickState': null
            };
            await database.ref(`rooms/${currentRoomId}`).update(roomUpdates);
            
            alert('Đã xóa log trên Google Sheet và reset vai trò người chơi thành công!');
        } catch (error) {
            console.error('Lỗi khi xóa log và reset game:', error);
            alert('Có lỗi xảy ra: ' + error.message);
        }
    };

    const deleteActiveRoom = () => {
        if (!currentRoomId || !confirm(`Bạn có chắc muốn xóa vĩnh viễn phòng '${currentRoomId}'?`)) return;
        database.ref(`rooms/${currentRoomId}`).remove()
            .then(() => {
                alert(`Phòng '${currentRoomId}' đã được xóa.`);
                resetAdminUI();
            })
            .catch((error) => alert("Lỗi khi xóa phòng: " + error.message));
    };

    const resetAdminUI = () => {
        if (roomListener && currentRoomId) {
            database.ref(`rooms/${currentRoomId}`).off('value', roomListener);
            roomListener = null;
        }
        if (pickTimerInterval) clearInterval(pickTimerInterval);
        
        document.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
        document.querySelectorAll('input[type="number"]').forEach(num => num.value = 0);
        
        currentRoomId = null;
        roomIdDisplay.textContent = "Chưa tạo";
        activeRoomSection.classList.add('hidden');
        playerPickMonitoringSection.classList.add('hidden');
        setupSection.classList.remove('hidden');
        
        playerListUI.innerHTML = '';
        rolesInGameList.innerHTML = '';
        playersTotalDisplay.textContent = '0';
        rolesTotalDisplay.textContent = '0';
        
        updateCounters();
        loadAndDisplayRooms();
    };

    // --- EVENT LISTENERS ---
    createRoomBtn.addEventListener('click', createRoom);
    startNormalRandomBtn.addEventListener('click', startNormalRandom);
    startPlayerPickBtn.addEventListener('click', startPlayerPick);
    processPlayerPickBtn.addEventListener('click', processPlayerPick);
    clearGamelogBtn.addEventListener('click', clearGameLog);
    deleteRoomBtn.addEventListener('click', deleteActiveRoom);
    playerListContainer.addEventListener('change', updateCounters);
    rolesByFactionContainer.addEventListener('input', updateCounters);
    refreshRoomsBtn.addEventListener('click', loadAndDisplayRooms);
    backToSetupBtn.addEventListener('click', resetAdminUI);

    roomListContainer.addEventListener('click', (event) => {
        const target = event.target;
        if (target.classList.contains('manage-room-btn')) {
            loadRoomForManagement(target.dataset.roomId);
        }
        if (target.classList.contains('delete-room-btn')) {
            handleDeleteRoomFromList(target.dataset.roomId);
        }
    });
    
    // --- TẢI DỮ LIỆU BAN ĐẦU ---
    loadPlayersFromSheet();
    loadRolesFromSheet();
    loadAndDisplayRooms();
});