// =================================================================
// === minigame-logic.js - Module quản lý Mini Game ===
// =================================================================

class MinigameManager {
    constructor(database, roomId, getRoomPlayers, getNightStates) {
        this.database = database;
        this.roomId = roomId;
        this.getRoomPlayers = getRoomPlayers; // Hàm để lấy danh sách người chơi hiện tại
        this.getNightStates = getNightStates; // Hàm để lấy trạng thái các đêm

        // Lấy các DOM elements
        this.minigameSection = document.getElementById('minigame-section');
        this.minigameSelect = document.getElementById('minigame-select');
        this.startMinigameBtn = document.getElementById('start-minigame-btn');
        this.endMinigameBtn = document.getElementById('end-minigame-btn');
        this.minigameResultsContainer = document.getElementById('minigame-results-container');
        this.minigameResultsDetails = document.getElementById('minigame-results-details');

        this.attachEventListeners();
        this.listenForStateChanges();
    }

    attachEventListeners() {
        if (this.startMinigameBtn) this.startMinigameBtn.addEventListener('click', () => this.handleStartMinigame());
        if (this.endMinigameBtn) this.endMinigameBtn.addEventListener('click', () => this.handleEndMinigame());
    }

    listenForStateChanges() {
        this.database.ref(`rooms/${this.roomId}/minigameState`).on('value', (snapshot) => {
            const state = snapshot.val();
            if (!this.minigameSection) return;

            if (!state || state.status === 'inactive') {
                this.startMinigameBtn.style.display = 'inline-block';
                this.endMinigameBtn.style.display = 'none';
                this.minigameResultsContainer.style.display = 'none';
                this.minigameSelect.disabled = false;
            } else if (state.status === 'active') {
                this.startMinigameBtn.style.display = 'none';
                this.endMinigameBtn.style.display = 'inline-block';
                this.minigameResultsContainer.style.display = 'none';
                this.minigameSelect.disabled = true;
            } else if (state.status === 'finished') {
                this.startMinigameBtn.style.display = 'inline-block';
                this.endMinigameBtn.style.display = 'none';
                this.minigameResultsContainer.style.display = 'block';
                this.minigameSelect.disabled = false;
                
                this.renderResults(state);
            }
        });
    }

    renderResults(state) {
        let resultsHTML = '<ul>';
        const results = state.results;
        if (results && state.participants) {
            for (const pId in state.participants) {
                const name = state.participants[pId];
                const count = results.trustCounts[pId] || 0;
                const isDead = results.deadPlayerNames.includes(name);
                resultsHTML += `<li style="${isDead ? 'color: var(--danger-color); text-decoration: line-through;' : ''}">
                    <strong>${name}:</strong> ${count} phiếu tin tưởng
                </li>`;
            }
        }
        resultsHTML += '</ul>';
        this.minigameResultsDetails.innerHTML = resultsHTML;
    }

    handleStartMinigame() {
        const nightStates = this.getNightStates();
        const roomPlayers = this.getRoomPlayers();
        const lastNight = nightStates[nightStates.length - 1];

        if (!lastNight) {
            alert("Chưa có đêm nào bắt đầu!");
            return;
        }
        const { finalStatus } = calculateNightStatus(lastNight, roomPlayers);
        const livingPlayers = roomPlayers.filter(p => finalStatus[p.id]?.isAlive);

        if (livingPlayers.length < 3) {
            alert("Cần ít nhất 3 người chơi còn sống để bắt đầu mini game này.");
            return;
        }

        const participants = livingPlayers.reduce((acc, p) => {
            acc[p.id] = p.name;
            return acc;
        }, {});

        const gameType = this.minigameSelect.value;
        let title = "";

        if (gameType === 'night_of_trust') {
            title = "Mini Game: Đêm của Lòng Tin";
        }

        const newMinigameState = {
            status: 'active', gameType, title, participants,
            choices: null, results: null
        };

        this.database.ref(`rooms/${this.roomId}/minigameState`).set(newMinigameState);
    }

    async handleEndMinigame() {
        this.endMinigameBtn.disabled = true;
        this.endMinigameBtn.textContent = "Đang xử lý...";

        const minigameStateRef = this.database.ref(`rooms/${this.roomId}/minigameState`);
        const snapshot = await minigameStateRef.once('value');
        const currentState = snapshot.val();

        if (!currentState || currentState.status !== 'active') {
            alert("Mini game chưa được bắt đầu hoặc đã kết thúc.");
            this.endMinigameBtn.disabled = false;
            this.endMinigameBtn.textContent = "Kết Thúc & Xử Lý";
            return;
        }

        if (currentState.gameType === 'night_of_trust') {
            const choices = currentState.choices || {};
            const participants = currentState.participants || {};
            const trustCounts = {};
            Object.keys(participants).forEach(pId => { trustCounts[pId] = 0; });

            Object.values(choices).forEach(trustedArray => {
                if (Array.isArray(trustedArray)) {
                    trustedArray.forEach(id => { if (trustCounts.hasOwnProperty(id)) trustCounts[id]++; });
                }
            });

            const deadPlayerIds = Object.keys(trustCounts).filter(id => trustCounts[id] === 0);
            const deadPlayerNames = deadPlayerIds.map(id => participants[id]);

            const updates = {};
            deadPlayerIds.forEach(id => {
                updates[`/players/${id}/isAlive`] = false;
            });
            await this.database.ref(`rooms/${this.roomId}`).update(updates);

            updates[`/minigameState/status`] = 'finished';
            updates[`/minigameState/results`] = { trustCounts, deadPlayerNames };
            await this.database.ref(`rooms/${this.roomId}`).update(updates);

            alert(`Mini game kết thúc! Người chết: ${deadPlayerNames.join(', ') || 'Không có ai'}.`);
        }

        this.endMinigameBtn.disabled = false;
        this.endMinigameBtn.textContent = "Kết Thúc & Xử Lý";
    }
}