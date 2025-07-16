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
    const roomIdDisplay = document.getElementById('room-id-display');
    const interactionTable = document.getElementById('player-interaction-table');
    const nightResultsDiv = document.getElementById('night-results');
    const resetNightBtn = document.getElementById('reset-night-btn');

    // --- State ---
    let currentRoomId = null;
    let roomPlayers = [];

    // --- Functions ---
    
    // Lấy roomId từ URL
    const getRoomIdFromURL = () => {
        const params = new URLSearchParams(window.location.search);
        return params.get('roomId');
    };

    // Tạo giao diện cho một người chơi
    const createPlayerRow = (player) => {
        const row = document.createElement('div');
        row.className = 'player-row';
        row.dataset.playerId = player.id; // Sử dụng id duy nhất

        row.innerHTML = `
            <div class="player-info">
                <div class="player-name">${player.name}</div>
                <div class="player-role">${player.roleName || 'Chưa có vai'}</div>
            </div>
            <div class="player-status-controls">
                <button class="status-btn alive active" data-status="life" title="Đánh dấu Sống/Chết"><i class="fas fa-heart"></i></button>
                <button class="status-btn ability-on active" data-status="ability" title="Đánh dấu Chức năng còn/mất"><i class="fas fa-star"></i></button>
            </div>
            <div class="interaction-group">
                <label class="checkbox-label" title="Bị Sói cắn"><input type="checkbox" data-action="wolf_bite"> Sói Cắn</label>
                <label class="checkbox-label" title="Sát thương từ phe Sói"><input type="checkbox" data-action="wolf_dmg"> ST Sói</label>
                <label class="checkbox-label" title="Sát thương từ phe Dân"><input type="checkbox" data-action="villager_dmg"> ST Dân</label>
                <label class="checkbox-label" title="Sát thương khác (Tình nhân,...)"><input type="checkbox" data-action="other_dmg"> ST Khác</label>
                <label class="checkbox-label" title="Được Bảo Vệ"><input type="checkbox" data-action="protect"> Bảo Vệ</label>
                <label class="checkbox-label" title="Được Phù Thủy Cứu"><input type="checkbox" data-action="save"> Cứu</label>
                <label class="checkbox-label" title="Còn Giáp"><input type="checkbox" data-action="armor"> Giáp</label>
            </div>
            <div class="grouping-control">
                <input type="number" min="1" placeholder="Nhóm" title="Nhập số nhóm (ví dụ: 1 cho cặp đôi)">
            </div>
        `;
        return row;
    };

    // Hiển thị tất cả người chơi
    const displayPlayers = (players) => {
        interactionTable.innerHTML = ''; // Xóa spinner
        if (!players || players.length === 0) {
            interactionTable.innerHTML = '<p>Không có người chơi trong phòng.</p>';
            return;
        }
        players.forEach(player => {
            const playerRow = createPlayerRow(player);
            interactionTable.appendChild(playerRow);
        });
    };

    // Lấy dữ liệu phòng từ Firebase
    const fetchRoomData = (roomId) => {
        const roomRef = database.ref(`rooms/${roomId}`);
        roomRef.on('value', (snapshot) => {
            const data = snapshot.val();
            if (data && data.players) {
                // Chuyển đổi object players thành array và gán id
                roomPlayers = Object.keys(data.players).map(key => ({
                    id: key,
                    ...data.players[key]
                }));
                displayPlayers(roomPlayers);
            } else {
                interactionTable.innerHTML = '<p>Không tìm thấy dữ liệu phòng hoặc phòng không có người chơi.</p>';
            }
        }, (error) => {
            console.error(error);
            interactionTable.innerHTML = '<p>Lỗi khi tải dữ liệu phòng.</p>';
        });
    };

    // --- Initial Load ---
    currentRoomId = getRoomIdFromURL();
    if (currentRoomId) {
        roomIdDisplay.textContent = currentRoomId;
        fetchRoomData(currentRoomId);
    } else {
        document.body.innerHTML = '<h1>Lỗi: Không tìm thấy ID phòng. Vui lòng quay lại trang quản trị.</h1>';
    }
});