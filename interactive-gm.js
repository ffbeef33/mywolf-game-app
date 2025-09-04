// =================================================================
// === interactive-gm.js - CẬP NHẬT LOG HÀNH ĐỘNG & HIỂN THỊ NGƯỜI CHẾT ===
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
    let actionLogListener = null; // <-- Listener mới cho log hành động
    let roomData = {};
    let allRolesData = {};

    const initialize = async () => {
        const urlParams = new URLSearchParams(window.location.search);
        currentRoomId = urlParams.get('roomId');
        if (!currentRoomId) {
            document.body.innerHTML = '<h1>Lỗi: Không tìm thấy ID phòng trong URL.</h1>';
            return;
        }
        await fetchAllRolesData();
        roomIdDisplay.textContent = currentRoomId;
        attachListenersToRoom(); // <-- Đổi tên hàm để gắn nhiều listener
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

    const attachListenersToRoom = () => {
        // Listener chính
        if (roomListener) database.ref(`rooms/${currentRoomId}`).off('value', roomListener);
        const roomRef = database.ref(`rooms/${currentRoomId}`);
        roomListener = roomRef.on('value', (snapshot) => {
            if (!snapshot.exists()) {
                alert("Phòng không còn tồn tại!");
                return;
            }
            roomData = snapshot.val();
            render();

            // Cập nhật listener cho log hành động mỗi khi có data mới (để lấy đúng số đêm)
            const currentNight = roomData.interactiveState?.currentNight || 0;
            if (currentNight > 0) {
                attachActionLogListener(currentNight);
            }
        });
    };
    
    // === HÀM MỚI: Lắng nghe và hiển thị log hành động ===
    const attachActionLogListener = (nightNumber) => {
        const actionLogRef = database.ref(`rooms/${currentRoomId}/nightActions/${nightNumber}`);
        if(actionLogListener) {
            actionLogListener.off(); // Tắt listener cũ
        }
        actionLogListener = actionLogRef;
        actionLogListener.on('value', (snapshot) => {
            const actions = snapshot.val() || {};
            renderActionLog(actions);
        });
    }

    const render = () => {
        renderPlayerList();
        renderGameState();
        // Log hành động sẽ được render riêng qua listener của nó
    };
    
    // === HÀM MỚI: Render log hành động ra giao diện ===
    const renderActionLog = (actions) => {
        gameLog.innerHTML = ''; // Xóa log cũ
        if (Object.keys(actions).length === 0) {
            gameLog.innerHTML = '<p><em>Chưa có người chơi nào hành động...</em></p>';
            return;
        }

        for(const actorId in actions) {
            const actionData = actions[actorId];
            const targetId = actionData.target;
            
            let actorName = "Bầy Sói";
            if (actorId !== 'wolf_group') {
                actorName = roomData.players[actorId]?.name || 'Người chơi không xác định';
            }

            const targetName = roomData.players[targetId]?.name || 'Mục tiêu không xác định';
            const actionLabel = KIND_TO_ACTION_MAP[actionData.action]?.label || actionData.action;

            const p = document.createElement('p');
            p.innerHTML = `[ĐÊM] <strong>${actorName}</strong> đã chọn <em>${actionLabel}</em> <strong>${targetName}</strong>.`;
            gameLog.prepend(p);
        }
    }


    const renderPlayerList = () => {
        const players = roomData.players || {};
        playerListUI.innerHTML = '';
        playersTotalDisplay.textContent = Object.keys(players).length;

        Object.entries(players).forEach(([id, player]) => {
            const li = document.createElement('li');
            li.className = 'player-item';
            
            // SỬA LỖI: Thêm class 'dead' nếu isAlive là false
            if (!player.isAlive) {
                li.classList.add('dead');
            }
            
            li.innerHTML = `
                <span class="player-name">${player.name} <strong>(${player.roleName || 'Chưa có vai'})</strong></span>
                <button class="btn-secondary gm-action-btn" data-player-id="${id}" data-player-name="${player.name}">Hành động</button>
            `;
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

        startNightBtn.innerHTML = '<i class="fas fa-moon"></i> Bắt Đầu Đêm';

        switch (state.phase) {
            case 'setup':
                phaseText = "Sẵn sàng bắt đầu";
                startNightBtn.disabled = false;
                break;
            case 'night':
                phaseText = `Đêm ${state.currentNight}`;
                endNightBtn.disabled = false;
                gameLog.innerHTML = '<p><em>Đang chờ người chơi hành động...</em></p>'; // Reset log khi đêm bắt đầu
                break;
            case 'day':
                phaseText = `Thảo luận ngày ${state.currentNight}`;
                startNightBtn.disabled = false; 
                startDayBtn.disabled = false;
                startVoteBtn.disabled = false;
                startNightBtn.innerHTML = '<i class="fas fa-moon"></i> Bắt Đầu Đêm Tiếp Theo';
                break;
            case 'voting':
                 phaseText = `Bỏ phiếu Ngày ${state.currentNight}`;
                 startNightBtn.disabled = false;
                 startNightBtn.innerHTML = '<i class="fas fa-moon"></i> Bắt Đầu Đêm Tiếp Theo';
                 break;
            case 'ended':
                phaseText = "Game đã kết thúc";
                startNightBtn.disabled = false;
                startNightBtn.innerHTML = '<i class="fas fa-redo"></i> Bắt Đầu Game Mới';
                break;
        }
        currentPhaseDisplay.textContent = phaseText;
    };
    
    const processNightResults = async () => {
        endNightBtn.disabled = true;
        endNightBtn.textContent = "Đang xử lý...";

        const state = roomData.interactiveState;
        const currentNight = state.currentNight;
        const playerActions = roomData.nightActions?.[currentNight] || {};
        const allPlayers = roomData.players;

        const initialPlayerStatus = Object.fromEntries(
            Object.entries(allPlayers).map(([id, player]) => {
                const roleName = player.roleName || "";
                const roleInfo = allRolesData[roleName] || {};
                return [id, { 
                    isAlive: player.isAlive, 
                    faction: roleInfo.faction,
                    kind: roleInfo.kind,
                    roleName: roleName
                }]
            })
        );
        
        let actionIdCounter = 0;
        const formattedActions = [];
        for (const actorId in playerActions) {
            if (actorId === 'wolf_group') {
                formattedActions.push({
                    id: actionIdCounter++,
                    actorId: 'wolf_group',
                    targetId: playerActions[actorId].target,
                    action: 'kill'
                });
            } else {
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
        
        const results = calculateNightStatus(nightStateForCalc, roomPlayersForCalc);
        const { finalStatus, deadPlayerNames, infoResults } = results;

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

    // --- Xử lý sự kiện nhấn nút ---
    startNightBtn.addEventListener('click', () => {
        const state = roomData.interactiveState || {};
        // Nếu game đã kết thúc, nút này sẽ reset game
        if (state.phase === 'ended') {
            if(!confirm("Bạn có muốn reset và bắt đầu game mới không?")) return;
            // Logic reset game (có thể mở rộng sau)
            const updates = {};
            Object.keys(roomData.players).forEach(pId => {
                updates[`/players/${pId}/isAlive`] = true;
            });
            updates['/nightActions'] = null;
            updates['/nightResults'] = null;
            updates['/interactiveLog'] = null;
            database.ref(`rooms/${currentRoomId}`).update(updates);
        }

        const currentNightNumber = (state.phase === 'ended' ? 0 : state.currentNight || 0) + 1;
        const newState = {
            phase: 'night',
            currentNight: currentNightNumber,
            message: `Đêm ${currentNightNumber} bắt đầu.`
        };
        
        if(state.phase === 'ended') {
             database.ref(`rooms/${currentRoomId}/interactiveState`).set(newState);
        } else {
             database.ref(`rooms/${currentRoomId}/interactiveState`).update(newState);
        }
        
        addLog(`Đã bắt đầu Đêm ${currentNightNumber}.`);
    });

    endNightBtn.addEventListener('click', processNightResults);
    
    startDayBtn.addEventListener('click', () => {
        const currentNightNumber = roomData.interactiveState?.currentNight || 1;
        database.ref(`rooms/${currentRoomId}/interactiveState`).update({
            phase: 'day',
            message: `Ngày ${currentNightNumber}. Mọi người thảo luận.`
        });
        addLog(`Bắt đầu giai đoạn Thảo luận.`);
    });

    startVoteBtn.addEventListener('click', () => {
        const currentNightNumber = roomData.interactiveState?.currentNight || 1;
         database.ref(`rooms/${currentRoomId}/interactiveState`).update({
            phase: 'voting',
            message: `Ngày ${currentNightNumber}. Bắt đầu bỏ phiếu.`
        });
        addLog(`Bắt đầu giai đoạn Bỏ phiếu.`);
    });
    
    endGameBtn.addEventListener('click', () => {
        if (!confirm('Bạn có chắc muốn kết thúc ván chơi này?')) return;
        const newState = {
            phase: 'ended',
            message: `Game đã kết thúc bởi Quản trò.`
        };
        database.ref(`rooms/${currentRoomId}/interactiveState`).update(newState);
        addLog(`Đã kết thúc game.`);
    });
    
    playerListUI.addEventListener('click', (e) => {
        if (e.target && e.target.classList.contains('gm-action-btn')) {
            const playerId = e.target.dataset.playerId;
            const playerName = e.target.dataset.playerName;
            const player = roomData.players[playerId];
            if (!player) return;
            const action = prompt(`Chọn hành động cho ${playerName}:\n1: Giết\n2: Hồi sinh\n(Nhập 1 hoặc 2)`);
            const playerRef = database.ref(`rooms/${currentRoomId}/players/${playerId}/isAlive`);
            if (action === '1') {
                if (confirm(`Bạn có chắc muốn GIẾT ${playerName}?`)) {
                    playerRef.set(false);
                    addLog(`Đã GIẾT người chơi ${playerName} (thủ công).`);
                }
            } else if (action === '2') {
                if (confirm(`Bạn có chắc muốn HỒI SINH ${playerName}?`)) {
                    playerRef.set(true);
                    addLog(`Đã HỒI SINH người chơi ${playerName} (thủ công).`);
                }
            }
        }
    });

    initialize();
});