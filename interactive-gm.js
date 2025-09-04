// =================================================================
// === interactive-gm.js - Module Game Tương Tác cho Quản Trò (Cập nhật Bước 3) ===
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

    // --- Các phần tử DOM ---
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

    // --- Biến trạng thái ---
    let currentRoomId = null;
    let roomListener = null;
    let roomData = {}; 

    const initialize = () => {
        const urlParams = new URLSearchParams(window.location.search);
        currentRoomId = urlParams.get('roomId');
        if (!currentRoomId) {
            document.body.innerHTML = '<h1>Lỗi: Không tìm thấy ID phòng trong URL.</h1>';
            return;
        }
        roomIdDisplay.textContent = currentRoomId;
        attachRoomListener();
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
            case 'voting':
                phaseText = `Bỏ phiếu treo cổ`;
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

    // === HÀM XỬ LÝ KẾT QUẢ ĐÊM ===
    const processNightResults = async () => {
        endNightBtn.disabled = true;
        endNightBtn.textContent = "Đang xử lý...";

        const state = roomData.interactiveState;
        const currentNight = state.currentNight;
        const playerActions = roomData.nightActions?.[currentNight] || {};
        const allPlayers = roomData.players;

        // 1. Lấy trạng thái người chơi từ đầu đêm
        // (Sẽ cần cải tiến để lấy trạng thái từ đêm trước đó)
        const initialPlayerStatus = Object.fromEntries(
            Object.entries(allPlayers).map(([id, player]) => [id, { isAlive: player.isAlive, faction: player.faction /* thêm các status khác nếu có */ }])
        );

        // 2. Chuyển đổi actions của người chơi sang định dạng mà hàm logic cần
        let actionIdCounter = 0;
        const formattedActions = Object.entries(playerActions).map(([actorId, actionData]) => ({
            id: actionIdCounter++,
            actorId: actorId,
            targetId: actionData.target,
            action: actionData.action 
        }));

        // 3. Chuẩn bị đối tượng nightState để đưa vào hàm tính toán
        const nightStateForCalc = {
            actions: formattedActions,
            playersStatus: initialPlayerStatus,
            // Các thuộc tính khác như damageGroups, factionChanges... sẽ được thêm sau
        };
        
        // Lấy danh sách người chơi đầy đủ với vai trò để truyền vào hàm tính toán
        const roomPlayersForCalc = Object.entries(allPlayers).map(([id, data]) => ({ id, ...data }));
        
        // 4. Gọi hàm logic dùng chung
        const results = calculateNightStatus(nightStateForCalc, roomPlayersForCalc);
        const { finalStatus, deadPlayerNames } = results;

        // 5. Cập nhật dữ liệu lên Firebase
        const updates = {};
        
        // Cập nhật trạng thái isAlive của người chơi
        for (const playerId in finalStatus) {
            if (initialPlayerStatus[playerId].isAlive && !finalStatus[playerId].isAlive) {
                updates[`/players/${playerId}/isAlive`] = false;
            }
            // Cập nhật các trạng thái khác nếu cần (giáp, hiệu ứng...)
        }

        // Lưu kết quả công khai
        updates[`/nightResults/${currentNight}`] = {
            deadPlayerNames: deadPlayerNames || [],
            timestamp: firebase.database.ServerValue.TIMESTAMP
        };
        
        // Chuyển sang phase ban ngày
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
        const currentNightNumber = (roomData.interactiveState?.currentNight || 0) + 1;
        const newState = {
            phase: 'night',
            currentNight: currentNightNumber,
            message: `Đêm ${currentNightNumber} bắt đầu. Người chơi hãy thực hiện chức năng.`
        };
        database.ref(`rooms/${currentRoomId}/interactiveState`).set(newState);
        addLog(`Đã bắt đầu Đêm ${currentNightNumber}.`);
    });

    endNightBtn.addEventListener('click', processNightResults);
    
    endGameBtn.addEventListener('click', () => {
        if (!confirm('Bạn có chắc muốn kết thúc ván chơi này?')) return;
        const newState = {
            phase: 'ended',
            currentNight: roomData.interactiveState?.currentNight || 0,
            message: `Game đã kết thúc bởi Quản trò.`
        };
        database.ref(`rooms/${currentRoomId}/interactiveState`).set(newState);
        addLog(`Đã kết thúc game.`);
    });

    initialize();
});