// =================================================================
// === interactive-gm.js - Module Game Tương Tác (PHIÊN BẢN HOÀN CHỈNH) ===
// =================================================================

document.addEventListener('DOMContentLoaded', () => {
    // --- Cấu hình Firebase ---
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
    const currentPhaseDisplay = document.getElementById('current-phase-display');
    const playerListUI = document.getElementById('player-list');
    const playersTotalDisplay = document.getElementById('players-total');
    const gameLog = document.getElementById('game-log');
    const startNightBtn = document.getElementById('start-night-btn');
    const endNightBtn = document.getElementById('end-night-btn');
    const startDayBtn = document.getElementById('start-day-btn');
    const startVoteBtn = document.getElementById('start-vote-btn');
    const endGameBtn = document.getElementById('end-game-btn');

    // --- State ---
    let currentRoomId = null;
    let roomListener = null;
    let roomData = {};
    let allRolesData = {}; // Dùng để lấy faction của role

    const initialize = async () => {
        const urlParams = new URLSearchParams(window.location.search);
        currentRoomId = urlParams.get('roomId');
        if (!currentRoomId) {
            document.body.innerHTML = '<h1>Lỗi: Không tìm thấy ID phòng trong URL.</h1>';
            return;
        }
        await fetchAllRolesData(); // Tải dữ liệu vai trò
        roomIdDisplay.textContent = currentRoomId;
        attachRoomListener();
    };

    const fetchAllRolesData = async () => {
        try {
            const response = await fetch(`/api/sheets?sheetName=Roles`);
            const rawData = await response.json();
            allRolesData = rawData.reduce((acc, role) => {
                if (role.RoleName) {
                    acc[role.RoleName.trim()] = {
                        faction: (role.Faction || 'Chưa phân loại').trim(),
                        kind: (role.Kind || 'empty').trim()
                    };
                }
                return acc;
            }, {});
        } catch (error) {
            console.error("Lỗi tải dữ liệu vai trò:", error);
        }
    };

    const attachRoomListener = () => {
        if (roomListener) database.ref(`rooms/${currentRoomId}`).off('value', roomListener);
        const roomRef = database.ref(`rooms/${currentRoomId}`);
        roomListener = roomRef.on('value', (snapshot) => {
            if (!snapshot.exists()) {
                alert("Phòng không còn tồn tại!");
                return;
            }
            roomData = snapshot.val();
            render();
        }, (error) => {
            console.error("Lỗi lắng nghe Firebase:", error);
            alert("Mất kết nối với server.");
        });
    };

    const render = () => {
        renderPlayerList();
        renderGameState();
    };

    const renderPlayerList = () => {
        const players = roomData.players || {};
        playerListUI.innerHTML = '';
        playersTotalDisplay.textContent = Object.keys(players).length;
        Object.values(players).forEach(player => {
            const li = document.createElement('li');
            li.className = 'player-item';
            if (!player.isAlive) li.classList.add('dead');
            li.innerHTML = `<span class="player-name">${player.name} <strong>(${player.roleName || 'Chưa có vai'})</strong></span>`;
            playerListUI.appendChild(li);
        });
    };

    const renderGameState = () => {
        const state = roomData.interactiveState || { phase: 'setup', currentNight: 0 };
        startNightBtn.disabled = true;
        endNightBtn.disabled = true;
        startDayBtn.disabled = true;
        startVoteBtn.disabled = true;
        let phaseText = "Thiết lập";
        switch (state.phase) {
            case 'setup':
                phaseText = "Sẵn sàng bắt đầu";
                startNightBtn.disabled = false;
                break;
            case 'night':
                phaseText = `Đêm ${state.currentNight}`;
                endNightBtn.disabled = false;
                break;
            case 'day':
                phaseText = `Thảo luận ngày ${state.currentNight}`;
                startDayBtn.disabled = false;
                startVoteBtn.disabled = false;
                break;
            case 'ended':
                phaseText = "Game đã kết thúc";
                break;
        }
        currentPhaseDisplay.textContent = phaseText;
    };

    const addLog = (message) => {
        const logEntry = {
            timestamp: firebase.database.ServerValue.TIMESTAMP,
            message: message
        };
        database.ref(`rooms/${currentRoomId}/interactiveLog`).push(logEntry);
        const p = document.createElement('p');
        p.textContent = `[GM] ${message}`;
        gameLog.prepend(p);
    };

    const processNightResults = async () => {
        endNightBtn.disabled = true;
        endNightBtn.textContent = "Đang xử lý...";

        const state = roomData.interactiveState;
        const currentNight = state.currentNight;
        const playerActions = roomData.nightActions?.[currentNight] || {};
        const allPlayers = roomData.players;

        // 1. Lấy trạng thái người chơi từ đầu đêm
        const initialPlayerStatus = Object.fromEntries(
            Object.entries(allPlayers).map(([id, player]) => {
                const roleName = player.roleName || "";
                const roleInfo = allRolesData[roleName] || {};
                return [id, { 
                    isAlive: player.isAlive, 
                    faction: roleInfo.faction,
                    kind: roleInfo.kind,
                    roleName: roleName
                    // Thêm các trạng thái mặc định khác nếu cần
                }]
            })
        );
        
        // 2. Chuyển đổi actions
        let actionIdCounter = 0;
        const formattedActions = [];
        for (const actorId in playerActions) {
            // Xử lý Sói cắn
            if (actorId === 'wolf_group') {
                formattedActions.push({
                    id: actionIdCounter++,
                    actorId: 'wolf_group',
                    targetId: playerActions[actorId].target,
                    action: 'kill' // Hành động mặc định của Sói
                });
            } else {
                // Xử lý người chơi khác
                formattedActions.push({
                    id: actionIdCounter++,
                    actorId: actorId,
                    targetId: playerActions[actorId].target,
                    action: playerActions[actorId].action
                });
            }
        }
        
        const nightStateForCalc = {
            actions: formattedActions,
            playersStatus: initialPlayerStatus,
        };

        const roomPlayersForCalc = Object.entries(allPlayers).map(([id, data]) => ({ 
            id, 
            ...data, 
            faction: allRolesData[data.roleName]?.faction || 'Chưa phân loại',
            kind: allRolesData[data.roleName]?.kind || 'empty'
        }));
        
        // 4. Gọi hàm logic dùng chung
        const results = calculateNightStatus(nightStateForCalc, roomPlayersForCalc);
        const { finalStatus, deadPlayerNames, infoResults } = results;

        // 5. Cập nhật dữ liệu lên Firebase
        const updates = {};
        
        for (const playerId in finalStatus) {
            if (initialPlayerStatus[playerId]?.isAlive && !finalStatus[playerId].isAlive) {
                updates[`/players/${playerId}/isAlive`] = false;
            }
        }

        updates[`/nightResults/${currentNight}/public`] = {
            deadPlayerNames: deadPlayerNames || [],
            log: infoResults || [],
            timestamp: firebase.database.ServerValue.TIMESTAMP
        };
        
        // Xử lý và ghi kết quả riêng tư
        infoResults.forEach(logString => {
            const match = logString.match(/- (.+?) \((.+?)\) đã (soi|điều tra|kiểm tra) (.+?): (.+)\./);
            if (match) {
                const [, roleName, actorName, action, targetName, result] = match;
                const actor = Object.entries(allPlayers).find(([id, p]) => p.name === actorName);
                if (actor) {
                    const actorId = actor[0];
                    updates[`/nightResults/${currentNight}/private/${actorId}`] = `Bạn đã ${action} ${targetName} và kết quả là: ${result}`;
                }
            }
        });

        updates[`/interactiveState/phase`] = 'day';
        updates[`/interactiveState/message`] = `Trời sáng! ${deadPlayerNames.length > 0 ? `Đêm qua đã có ${deadPlayerNames.join(', ')} bị giết.` : 'Đêm qua không có ai chết.'}`;

        try {
            await database.ref(`rooms/${currentRoomId}`).update(updates);
            addLog(`Xử lý đêm ${currentNight} thành công. ${deadPlayerNames.length} người chết.`);
        } catch (error) {
            console.error("Lỗi khi cập nhật kết quả đêm:", error);
            addLog(`Lỗi khi xử lý đêm: ${error.message}`);
        } finally {
            endNightBtn.disabled = false;
            endNightBtn.innerHTML = '<i class="fas fa-sun"></i> Kết Thúc Đêm & Xử Lý';
        }
    };

    // --- Gán sự kiện ---
    startNightBtn.addEventListener('click', () => {
        const currentNightNumber = (roomData.interactiveState?.currentNight || 0) + 1;
        const newState = {
            phase: 'night',
            currentNight: currentNightNumber,
            message: `Đêm ${currentNightNumber} bắt đầu.`
        };
        // Xóa action đêm cũ trước khi bắt đầu đêm mới
        database.ref(`rooms/${currentRoomId}/nightActions/${currentNightNumber}`).remove();
        database.ref(`rooms/${currentRoomId}/interactiveState`).set(newState);
        addLog(`Đã bắt đầu Đêm ${currentNightNumber}.`);
    });

    endNightBtn.addEventListener('click', processNightResults);
    
    endGameBtn.addEventListener('click', () => {
        if (!confirm('Bạn có chắc muốn kết thúc ván chơi này?')) return;
        const newState = {
            phase: 'ended',
            message: `Game đã kết thúc bởi Quản trò.`
        };
        database.ref(`rooms/${currentRoomId}/interactiveState`).update(newState);
        addLog(`Đã kết thúc game.`);
    });

    initialize();
});