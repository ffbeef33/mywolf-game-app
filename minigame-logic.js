// =================================================================
// === minigame-logic.js - Module quản lý Mini Game (Đã cập nhật) ===
// =================================================================

class MinigameManager {
    constructor(database, roomId, getRoomPlayers, getNightStates) {
        this.database = database;
        this.roomId = roomId;
        this.getRoomPlayers = getRoomPlayers; // Hàm để lấy danh sách người chơi hiện tại
        this.getNightStates = getNightStates; // Hàm để lấy trạng thái các đêm
        this.bomberGameTimeout = null;
        this.bomberGmTimerInterval = null; 
        this.serverTimeOffset = 0; 

        // Lấy chênh lệch thời gian với server
        this.database.ref('/.info/serverTimeOffset').on('value', (snapshot) => { 
            this.serverTimeOffset = snapshot.val();
        });

        // Lấy các DOM elements
        this.minigameSection = document.getElementById('minigame-section');
        this.minigameSelect = document.getElementById('minigame-select');
        this.startMinigameBtn = document.getElementById('start-minigame-btn');
        this.endMinigameBtn = document.getElementById('end-minigame-btn');
        this.shootBtn = document.getElementById('shoot-minigame-btn');
        this.endPuzzleGameBtn = document.getElementById('end-puzzle-game-btn');
        this.minigameResultsContainer = document.getElementById('minigame-results-container');
        this.minigameResultsDetails = document.getElementById('minigame-results-details');
        this.minigameLiveChoices = document.getElementById('minigame-live-choices');
        this.minigameLiveChoicesList = document.getElementById('minigame-live-choices-list');

        this.attachEventListeners();
        this.listenForStateChanges();
    }

    attachEventListeners() {
        if (this.startMinigameBtn) this.startMinigameBtn.addEventListener('click', () => this.handleStartMinigame());
        if (this.endMinigameBtn) this.endMinigameBtn.addEventListener('click', () => this.handleEndMinigame());
        if (this.shootBtn) this.shootBtn.addEventListener('click', () => this.handleShooting());
        if (this.endPuzzleGameBtn) this.endPuzzleGameBtn.addEventListener('click', () => this.handleEndPuzzleGame());
    }

    listenForStateChanges() {
        this.database.ref(`rooms/${this.roomId}/minigameState`).on('value', (snapshot) => {
            const state = snapshot.val();
            if (!this.minigameSection) return;

            // Mặc định ẩn tất cả các nút điều khiển
            this.startMinigameBtn.style.display = 'none';
            this.endMinigameBtn.style.display = 'none';
            this.shootBtn.style.display = 'none';

            if (!state || state.status === 'inactive') {
                this.startMinigameBtn.style.display = 'inline-block';
                this.minigameResultsContainer.style.display = 'none';
                this.minigameSelect.disabled = false;
                this.minigameLiveChoices.style.display = 'none';
            } else if (state.status === 'active') {
                this.endMinigameBtn.style.display = 'inline-block';
                this.minigameResultsContainer.style.display = 'none';
                this.minigameSelect.disabled = true;
                this.minigameLiveChoices.style.display = 'block';
                this.renderLiveChoices(state);
            } 
            else if (state.status === 'reveal_choice') {
                this.shootBtn.style.display = 'inline-block';
                this.minigameSelect.disabled = true;
                this.minigameResultsContainer.style.display = 'block'; // Hiển thị kết quả tạm thời
                this.minigameLiveChoices.style.display = 'none';
                this.renderResults(state); // Gọi render để hiển thị người được chọn
            }
            else if (state.status === 'finished') {
                this.startMinigameBtn.style.display = 'inline-block';
                this.minigameResultsContainer.style.display = 'block';
                this.minigameSelect.disabled = false;
                this.minigameLiveChoices.style.display = 'none';
                this.renderResults(state);
            }

            if (state && state.gameType === 'bomber_game' && !state.loser) {
                this.handleBomberGameTick(state);
            } else {
                if (this.bomberGameTimeout) clearTimeout(this.bomberGameTimeout);
                if (this.bomberGmTimerInterval) clearInterval(this.bomberGmTimerInterval); 
            }
        });

        this.database.ref(`rooms/${this.roomId}/slidingPuzzles`).on('value', (snapshot) => {
            const allPuzzles = snapshot.val();
            if (!this.endPuzzleGameBtn) return;

            // Mặc định ẩn nút
            this.endPuzzleGameBtn.style.display = 'none';
            
            if (!allPuzzles) {
                 // Xóa các thông tin puzzle cũ nếu không còn puzzle nào
                this.minigameLiveChoicesList.querySelectorAll('.sliding-puzzle-progress').forEach(el => el.remove());
                return;
            }

            const latestPuzzle = Object.values(allPuzzles).sort((a, b) => b.startTime - a.startTime)[0];

            if (latestPuzzle && latestPuzzle.status === 'active') {
                // Nếu có puzzle đang chạy -> HIỂN THỊ NÚT KẾT THÚC
                this.endPuzzleGameBtn.style.display = 'inline-block';
                this.minigameLiveChoices.style.display = 'block';
                this.renderPuzzleProgressForGM(latestPuzzle);
            } else {
                // Nếu không có puzzle nào active -> Xóa thông tin tiến trình cũ
                this.minigameLiveChoicesList.querySelectorAll('.sliding-puzzle-progress').forEach(el => el.remove());
            }
        });
    }

    async handleEndPuzzleGame() {
        if (!confirm("Bạn có chắc muốn kết thúc mini game 'Giải Mã Mê Cung' không?")) return;

        this.endPuzzleGameBtn.disabled = true;
        this.endPuzzleGameBtn.textContent = "Đang xử lý...";

        const puzzlesRef = this.database.ref(`rooms/${this.roomId}/slidingPuzzles`);
        const snapshot = await puzzlesRef.once('value');
        const allPuzzles = snapshot.val();

        if (allPuzzles) {
            let activePuzzleId = null;
            let activePuzzleData = null;
            for (const puzzleId in allPuzzles) {
                if (allPuzzles[puzzleId].status === 'active') {
                    activePuzzleId = puzzleId;
                    activePuzzleData = allPuzzles[puzzleId];
                    break;
                }
            }

            if (activePuzzleId) {
                const updates = {};
                const solvedByData = activePuzzleData.solvedBy || {};
                const playersWhoSolved = Object.entries(solvedByData);
                let winnerId = null;
                let announcementMsg = "Mini game 'Giải Mã Mê Cung' đã được Quản trò kết thúc. Không có ai được hồi sinh.";

                // Nếu có người đã giải xong
                if (playersWhoSolved.length > 0) {
                    // Sắp xếp để tìm người giải sớm nhất
                    playersWhoSolved.sort(([, a], [, b]) => a.timestamp - b.timestamp);
                    winnerId = playersWhoSolved[0][0]; // ID của người thắng
                    const winnerName = activePuzzleData.participants[winnerId];

                    // Hồi sinh người thắng cuộc
                    updates[`/players/${winnerId}/isAlive`] = true;
                    announcementMsg = `Mini game 'Giải Mã Mê Cung' đã kết thúc. ${winnerName} đã giải mã thành công và được hồi sinh!`;
                }
                
                // Cập nhật trạng thái game
                updates[`/slidingPuzzles/${activePuzzleId}/status`] = 'finished';
                updates[`/slidingPuzzles/${activePuzzleId}/winnerId`] = winnerId;
                updates[`/slidingPuzzles/${activePuzzleId}/results`] = {
                    winnerId: winnerId,
                    participants: activePuzzleData.participants
                };
                updates['/publicData/latestAnnouncement'] = {
                    message: announcementMsg,
                    timestamp: firebase.database.ServerValue.TIMESTAMP
                };
                
                await this.database.ref(`rooms/${this.roomId}`).update(updates);
                alert("Đã kết thúc mini game Giải Mã Mê Cung.");
            }
        }

        this.endPuzzleGameBtn.disabled = false;
        this.endPuzzleGameBtn.textContent = "Kết Thúc Mê Cung";
    }

    async handleShooting() {
        this.shootBtn.disabled = true;
        this.shootBtn.textContent = "Đang xử lý...";

        const minigameStateRef = this.database.ref(`rooms/${this.roomId}/minigameState`);
        const snapshot = await minigameStateRef.once('value');
        const currentState = snapshot.val();

        if (!currentState || currentState.status !== 'reveal_choice') {
            alert("Trạng thái game không hợp lệ để bắn.");
            return;
        }

        const { chosenOneId, maxBet, participants } = currentState.results;
        const chosenOneName = participants[chosenOneId];
        const updates = {};
        let finalOutcome = "";
        let announcementText = "";

        let survived = true;
        // Logic xác suất sống/chết
        if (maxBet === 8) { // Cược 8 viên có 5% cơ hội sống
            if (Math.random() > 0.05) survived = false;
        } else {
            if (Math.random() < (maxBet / 8.0)) survived = false;
        }

        if (survived) {
            finalOutcome = `${chosenOneName} đã SỐNG SÓT sau khi bắn với ${maxBet} viên đạn!`;
            announcementText = `Mini game Cò Quay Nga: ${chosenOneName} đã thắng và sống sót với ${maxBet} viên đạn!`;
        } else {
            finalOutcome = `${chosenOneName} đã CHẾT sau khi bắn với ${maxBet} viên đạn!`;
            announcementText = `Mini game Cò Quay Nga: ${chosenOneName} đã thua và bỏ mạng với ${maxBet} viên đạn!`;
            // Cập nhật trạng thái người chơi là đã chết
            updates[`/players/${chosenOneId}/isAlive`] = false;
        }

        // Cập nhật trạng thái mini game
        updates[`/minigameState/status`] = 'finished';
        updates[`/minigameState/results/outcome`] = finalOutcome;

        updates['/publicData/latestAnnouncement'] = {
            message: announcementText,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        };

        await this.database.ref(`rooms/${this.roomId}`).update(updates);

        this.shootBtn.disabled = false;
        this.shootBtn.textContent = "Bắt Đầu Bắn";
    }

    createParticipantSelectionModal(allPlayers, callback) {
        const oldModal = document.getElementById('participant-selection-modal');
        if (oldModal) oldModal.remove();

        const modal = document.createElement('div');
        modal.id = 'participant-selection-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <span class="close-modal-btn" style="color: #c9d1d9; position: absolute; top: 10px; right: 20px; font-size: 28px; font-weight: bold; cursor: pointer;">&times;</span>
                <h3>Chọn người chơi tham gia</h3>
                <div id="modal-player-list" class="target-grid" style="max-height: 40vh; overflow-y: auto; grid-template-columns: 1fr 1fr; border: 1px solid #30363d; padding: 10px; border-radius: 8px;"></div>
                <div style="text-align: right; margin-top: 20px;">
                    <button id="confirm-participants-btn" class="btn-primary">Xác Nhận</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const playerList = modal.querySelector('#modal-player-list');
        allPlayers.sort((a, b) => a.name.localeCompare(b.name)).forEach(p => {
            const item = document.createElement('div');
            item.className = 'target-item';
            item.style.backgroundColor = '#0d1117';
            item.innerHTML = `
                <input type="checkbox" id="participant-${p.id}" value="${p.id}" data-name="${p.name}">
                <label for="participant-${p.id}">${p.name} ${!p.isAlive ? '(Đã chết)' : ''}</label>
            `;
            playerList.appendChild(item);
        });

        const closeModal = () => modal.remove();
        modal.querySelector('.close-modal-btn').addEventListener('click', closeModal);
        modal.querySelector('#confirm-participants-btn').addEventListener('click', () => {
            const selected = modal.querySelectorAll('input:checked');
            const participants = {};
            selected.forEach(input => {
                participants[input.value] = input.dataset.name;
            });
            
            if (Object.keys(participants).length > 0) {
                callback(participants);
                closeModal();
            } else {
                alert("Vui lòng chọn ít nhất một người chơi.");
            }
        });
    }

    createBomberSetupModal(allPlayers, callback) {
        const oldModal = document.getElementById('bomber-setup-modal');
        if (oldModal) oldModal.remove();

        const modal = document.createElement('div');
        modal.id = 'bomber-setup-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <span class="close-modal-btn">&times;</span>
                <h3>Thiết lập game Kẻ Gài Boom</h3>
                <div class="form-group">
                    <label for="pass-limit-input">Boom sẽ nổ sau bao nhiêu lượt chuyền?</label>
                    <input type="number" id="pass-limit-input" class="form-control" value="5" min="2">
                </div>
                <h4>Chọn người chơi tham gia</h4>
                <div id="modal-player-list" class="target-grid" style="max-height: 40vh; overflow-y: auto;"></div>
                <div style="text-align: right; margin-top: 20px;">
                    <button id="confirm-bomber-setup-btn" class="btn-primary">Bắt Đầu Game</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const playerList = modal.querySelector('#modal-player-list');
        allPlayers.sort((a, b) => a.name.localeCompare(b.name)).forEach(p => {
            const item = document.createElement('div');
            item.className = 'target-item';
            item.innerHTML = `
                <input type="checkbox" id="participant-${p.id}" value="${p.id}" data-name="${p.name}" checked>
                <label for="participant-${p.id}">${p.name} ${!p.isAlive ? '(Đã chết)' : ''}</label>
            `;
            playerList.appendChild(item);
        });

        const closeModal = () => modal.remove();
        modal.querySelector('.close-modal-btn').addEventListener('click', closeModal);
        modal.querySelector('#confirm-bomber-setup-btn').addEventListener('click', () => {
            const selected = modal.querySelectorAll('input:checked');
            const participants = {};
            selected.forEach(input => {
                participants[input.value] = input.dataset.name;
            });

            const passLimit = parseInt(modal.querySelector('#pass-limit-input').value, 10);

            if (Object.keys(participants).length < 2) {
                alert("Vui lòng chọn ít nhất 2 người chơi.");
                return;
            }
            if (isNaN(passLimit) || passLimit < 2) {
                alert("Số lượt chuyền phải là một số lớn hơn 1.");
                return;
            }
            
            callback(participants, passLimit);
            closeModal();
        });
    }

    startBomberGame(participants, passLimit) {
        const participantIds = Object.keys(participants);
        const firstHolderId = participantIds[Math.floor(Math.random() * participantIds.length)];

        const newMinigameState = {
            status: 'active',
            gameType: 'bomber_game',
            title: 'Mini Game: Kẻ Gài Boom',
            participants,
            passLimit,
            passHistory: [firstHolderId],
            currentHolderId: firstHolderId,
            previousHolderId: null,
            passDeadline: firebase.database.ServerValue.TIMESTAMP
        };
        this.database.ref(`rooms/${this.roomId}/minigameState`).set(newMinigameState);
    }

    handleBomberGameTick(state) {
        if (this.bomberGameTimeout) clearTimeout(this.bomberGameTimeout);
    
        if (state.loser || state.status !== 'active') {
            return;
        }
    
        let loserId = null;
        let reason = null;
    
        if (state.passHistory.length > state.passLimit) {
            loserId = state.currentHolderId;
            reason = 'pass_limit';
        }
    
        if (!loserId) {
            const estimatedServerTime = Date.now() + this.serverTimeOffset;
            const timeRemaining = (state.passDeadline + 12000) - estimatedServerTime;
            
            if (timeRemaining <= 0) {
                loserId = state.currentHolderId;
                reason = 'timeout';
            }
        }
    
        if (loserId && reason) {
            const updates = {
                'loser': { id: loserId, reason: reason },
                'results': { 
                    loser: { id: loserId, reason: reason },
                    participants: state.participants,
                    passHistory: state.passHistory
                }
            };
            this.database.ref(`rooms/${this.roomId}/minigameState`).update(updates);
            return;
        }
    
        const estimatedServerTime = Date.now() + this.serverTimeOffset;
        const timeRemaining = (state.passDeadline + 12000) - estimatedServerTime;
        
        this.bomberGameTimeout = setTimeout(() => {
            this.database.ref(`rooms/${this.roomId}/minigameState`).once('value', snapshot => {
                const freshState = snapshot.val();
                if (freshState && freshState.status === 'active' && !freshState.loser) {
                   this.handleBomberGameTick(freshState);
                }
            });
        }, Math.max(timeRemaining + 200, 200));
    }

    startReturningSpiritGame(participants) {
        const correctPath = [
            Math.random() < 0.5 ? 'A' : 'B',
            Math.random() < 0.5 ? 'A' : 'B',
            Math.random() < 0.5 ? 'A' : 'B'
        ];
        
        const playerProgress = {};
        for (const pId in participants) {
            playerProgress[pId] = {
                name: participants[pId],
                choices: [],
                currentRound: 1,
                isEliminated: false,
                isWinner: false,
            };
        }

        const newMinigameState = {
            status: 'active',
            gameType: 'returning_spirit',
            title: 'Mini Game: Vong Hồn Trở Lại',
            participants,
            correctPath,
            playerProgress,
            winner: null
        };
        this.database.ref(`rooms/${this.roomId}/minigameState`).set(newMinigameState);
    }
    
    createSolvablePuzzle() {
        // Trạng thái đã giải: [1, 2, 3, 4, 5, 6, 7, 8, 0] (0 là ô trống)
        let puzzle = [1, 2, 3, 4, 5, 6, 7, 8, 0];
        let emptyIndex = 8;

        // Thực hiện 100-200 lần di chuyển ngẫu nhiên hợp lệ từ trạng thái đã giải
        const shuffleCount = Math.floor(Math.random() * 100) + 100;
        for (let i = 0; i < shuffleCount; i++) {
            const validMoves = [];
            const row = Math.floor(emptyIndex / 3);
            const col = emptyIndex % 3;

            if (row > 0) validMoves.push(emptyIndex - 3); // Lên
            if (row < 2) validMoves.push(emptyIndex + 3); // Xuống
            if (col > 0) validMoves.push(emptyIndex - 1); // Trái
            if (col < 2) validMoves.push(emptyIndex + 1); // Phải

            const moveIndex = validMoves[Math.floor(Math.random() * validMoves.length)];
            
            // Hoán đổi ô trống với ô được chọn
            [puzzle[emptyIndex], puzzle[moveIndex]] = [puzzle[moveIndex], puzzle[emptyIndex]];
            emptyIndex = moveIndex;
        }

        return puzzle;
    }

    renderPuzzleProgressForGM(puzzleState) {
        // Xóa các thông tin puzzle cũ
        this.minigameLiveChoicesList.querySelectorAll('.sliding-puzzle-progress').forEach(el => el.remove());

        const titleLi = document.createElement('li');
        titleLi.className = 'sliding-puzzle-progress';
        titleLi.innerHTML = `<hr style="margin: 10px 0;"><strong>Tiến trình Giải Mã Mê Cung:</strong>`;
        this.minigameLiveChoicesList.appendChild(titleLi);

        const solvedByData = puzzleState.solvedBy || {};

        for (const pId in puzzleState.playerProgress) {
            const progress = puzzleState.playerProgress[pId];
            const playerName = puzzleState.participants[pId];
            const li = document.createElement('li');
            li.className = 'sliding-puzzle-progress';

            if (solvedByData[pId]) {
                // Hiển thị thông báo bí mật cho quản trò
                li.innerHTML = `✅ <strong>${playerName}:</strong> <span style="color: var(--safe-color);">ĐÃ GIẢI XONG!</span> (${progress.moves || 0} lần)`;
            } else {
                li.innerHTML = `<strong>${playerName}:</strong> đã di chuyển ${progress.moves || 0} lần.`;
            }
            this.minigameLiveChoicesList.appendChild(li);
        }
    }

    renderLiveChoices(state) {
        if (!this.minigameLiveChoicesList) return;
        this.minigameLiveChoicesList.innerHTML = '';
        
        const participants = state.participants || {};

        if (state.gameType === 'night_of_trust') {
            const choices = state.choices || {};
            for (const playerId in participants) {
                const playerName = participants[playerId];
                const playerChoice = choices[playerId];
                let choiceText = '<em>Đang chờ...</em>';

                if (Array.isArray(playerChoice) && playerChoice.length > 0) {
                    const chosenNames = playerChoice.map(id => participants[id] || 'N/A').join(', ');
                    choiceText = `đã chọn: <strong>${chosenNames}</strong>`;
                }

                const li = document.createElement('li');
                li.innerHTML = `${playerName} ${choiceText}`;
                this.minigameLiveChoicesList.appendChild(li);
            }
        } else if (state.gameType === 'math_whiz') {
            const submissions = state.submissions || {};
            for (const playerId in participants) {
                const playerName = participants[playerId];
                const submission = submissions[playerId];
                let statusText = '<em>Chưa trả lời...</em>';

                if (submission && typeof submission.timestamp === 'number' && typeof state.startTime === 'number') {
                    const timeTaken = ((submission.timestamp - state.startTime) / 1000).toFixed(2);
                    statusText = `đã trả lời (Đáp án: ${submission.answer}) - <strong>${timeTaken}s</strong>`;
                } else if (submission) {
                    statusText = `đã trả lời (Đáp án: ${submission.answer}) - <strong>Đang xử lý...</strong>`;
                }
                const li = document.createElement('li');
                li.innerHTML = `${playerName} ${statusText}`;
                this.minigameLiveChoicesList.appendChild(li);
            }
        }
        else if (state.gameType === 'returning_spirit') {
            const { correctPath, playerProgress, winner } = state;
            
            const answerLi = document.createElement('li');
            answerLi.innerHTML = `<strong style="color: var(--safe-color);">Đáp án đúng: ${(correctPath || []).join(' - ')}</strong>`;
            this.minigameLiveChoicesList.appendChild(answerLi);
            
            if(winner) {
                 const winnerName = state.participants[winner];
                 const winnerLi = document.createElement('li');
                 winnerLi.innerHTML = `🏆 <strong>Người thắng cuộc: ${winnerName}</strong>`;
                 this.minigameLiveChoicesList.appendChild(winnerLi);
            }

            for (const pId in playerProgress) {
                const progress = playerProgress[pId];
                let statusText = '';
                const choicesText = (progress.choices || []).join(', ');

                if (progress.isWinner) {
                    statusText = `<span style="color: var(--safe-color);">ĐÃ THẮNG!</span> (Lựa chọn: ${choicesText})`;
                } else if (progress.isEliminated) {
                    statusText = `<span style="color: var(--danger-color);">ĐÃ BỊ LOẠI</span> (Lựa chọn: ${choicesText})`;
                } else {
                    statusText = `Đang ở Vòng ${progress.currentRound} (Đã chọn: ${choicesText || 'Chưa có'})`;
                }

                const li = document.createElement('li');
                li.innerHTML = `<strong>${progress.name}:</strong> ${statusText}`;
                this.minigameLiveChoicesList.appendChild(li);
            }
        } else if (state.gameType === 'russian_roulette') {
            const bets = state.bets || {};
            for (const playerId in participants) {
                const playerName = participants[playerId];
                const playerBet = bets[playerId];
                let betText = '<em>Đang chờ...</em>';

                if (playerBet) {
                    betText = `đã cược: <strong>${playerBet} viên</strong>`;
                }

                const li = document.createElement('li');
                li.innerHTML = `${playerName} ${betText}`;
                this.minigameLiveChoicesList.appendChild(li);
            }
        } else if (state.gameType === 'bomber_game') {
            if (this.bomberGmTimerInterval) clearInterval(this.bomberGmTimerInterval);

            if (state.loser) {
                const loserName = state.participants[state.loser.id];
                const reason = state.loser.reason === 'timeout' ? 'hết giờ' : 'hết lượt chuyền';
                this.minigameLiveChoicesList.innerHTML = `<li><strong style="color:var(--danger-color)">KẾT THÚC:</strong> ${loserName} đã nổ tung vì ${reason}.</li>`;
            } else if (state.currentHolderId) {
                const holderName = state.participants[state.currentHolderId];
                const passCount = state.passHistory.length - 1;

                this.minigameLiveChoicesList.innerHTML = `
                    <li><strong>Người giữ boom:</strong> ${holderName}</li>
                    <li id="gm-bomber-timer-li"><strong>Thời gian còn lại:</strong> --s</li>
                    <li><strong>Lượt chuyền:</strong> ${passCount} / ${state.passLimit}</li>
                `;

                const timerElement = document.getElementById('gm-bomber-timer-li');
                const deadline = state.passDeadline + 12000;

                this.bomberGmTimerInterval = setInterval(() => {
                    if (timerElement) {
                        const estimatedServerTime = Date.now() + this.serverTimeOffset;
                        const remaining = Math.max(0, Math.round((deadline - estimatedServerTime) / 1000));
                        timerElement.innerHTML = `<strong>Thời gian còn lại:</strong> ${remaining}s`;
                    }
                }, 500);
            }
        }
    }

    renderResults(state) {
        let resultsHTML = '';
        if (state.gameType === 'russian_roulette') {
            const { bets, chosenOneId, participants, outcome, isTie } = state.results || {};
            resultsHTML = '<h4>Chi tiết cược:</h4><ul>';
            if (bets) {
                for (const name in bets) {
                    resultsHTML += `<li><strong>${name}:</strong> ${bets[name]}</li>`;
                }
            }
            resultsHTML += '</ul><hr style="border-color: var(--border-color); margin: 10px 0;">';
            
            if (state.status === 'reveal_choice') {
                const chosenOneName = participants[chosenOneId];
                resultsHTML += `<p><strong>Người được chọn:</strong> ${chosenOneName}</p>`;
                resultsHTML += `<p><strong>Kết cục:</strong> <em style="opacity: 0.7">Đang chờ Quản trò...</em></p>`;
            } else { // 'finished' status
                if (isTie) {
                    resultsHTML += `<p><strong>Kết quả:</strong> ${outcome}</p>`;
                } else if (chosenOneId) {
                    const chosenOneName = participants[chosenOneId];
                    resultsHTML += `<p><strong>Người được chọn:</strong> ${chosenOneName}</p>`;
                    resultsHTML += `<p><strong>Kết cục:</strong> ${outcome}</p>`;
                } else {
                    resultsHTML += `<p><strong>Kết quả:</strong> Không có ai đặt cược.</p>`;
                }
            }
            this.minigameResultsDetails.innerHTML = resultsHTML;
            return;
        }

        if (!state.results) {
            this.minigameResultsDetails.innerHTML = "<p>Không có kết quả.</p>";
            return;
        }

        if (state.gameType === 'night_of_trust') {
            resultsHTML = '<ul>';
            const { trustCounts, deadPlayerNames } = state.results;
            if (trustCounts && state.participants) {
                for (const pId in state.participants) {
                    const name = state.participants[pId];
                    const count = trustCounts[pId] || 0;
                    const isDead = deadPlayerNames.includes(name);
                    resultsHTML += `<li style="${isDead ? 'color: var(--danger-color); text-decoration: line-through;' : ''}">
                        <strong>${name}:</strong> ${count} phiếu tin tưởng
                    </li>`;
                }
            }
            resultsHTML += '</ul>';
        } else if (state.gameType === 'math_whiz') {
            const { winnerName, timeToAnswer, problem } = state.results;
            resultsHTML = `<p><strong>Câu hỏi:</strong> ${problem.question} = ${problem.correctAnswer}</p>`;
            if (winnerName) {
                resultsHTML += `<p>🏆 <strong>Người thắng cuộc:</strong> ${winnerName} (Trả lời trong ${timeToAnswer.toFixed(2)}s)</p>`;
            } else {
                resultsHTML += `<p> Rất tiếc, không có ai trả lời đúng.</p>`;
            }
        } else if (state.gameType === 'returning_spirit') {
             const { winnerId, correctPath, participants } = state.results;
             const winnerName = winnerId ? participants[winnerId] : null;
             resultsHTML = `<p><strong>Con đường đúng:</strong> ${correctPath.join(' - ')}</p>`;
             if(winnerName) {
                resultsHTML += `<p>🏆 <strong>Người thắng cuộc:</strong> ${winnerName}</p>`;
             } else {
                resultsHTML += `<p>Rất tiếc, không có ai chiến thắng.</p>`;
             }
        } else if (state.gameType === 'bomber_game') {
            const { loser, participants, passHistory } = state.results;
            resultsHTML = ''; 
        
            if (loser && participants) {
                const loserName = participants[loser.id] || "Người chơi không xác định";
                let reasonText = '';
        
                switch (loser.reason) {
                    case 'timeout':
                        reasonText = 'giữ boom quá lâu';
                        break;
                    case 'pass_limit':
                        reasonText = 'hết lượt chuyền';
                        break;
                    case 'admin_force_end':
                        reasonText = 'do Quản trò kết thúc game';
                        break;
                    default:
                        reasonText = 'một lý do không xác định';
                }
        
                resultsHTML += `<p><strong>Người thua cuộc:</strong> ${loserName}</p>`;
                resultsHTML += `<p><strong>Lý do:</strong> ${reasonText}.</p>`;
            }
        
            if (passHistory && participants) {
                const historyText = passHistory.map(pId => participants[pId]).join(' → ');
                resultsHTML += `<h4>Lịch sử chuyền boom:</h4><p>${historyText}</p>`;
            }
        } else if (state.gameType === 'sliding_puzzle') {
            const { winnerId, participants } = state.results || {};
            if (winnerId) {
                const winnerName = participants[winnerId] || 'Người chơi lạ';
                resultsHTML = `<p>🏆 <strong>Người thắng cuộc:</strong> ${winnerName} đã giải được puzzle và sẽ được hồi sinh!</p>`;
            } else {
                resultsHTML = `<p>Trò chơi đã kết thúc nhưng không có người thắng cuộc.</p>`;
            }
        }
        
        this.minigameResultsDetails.innerHTML = resultsHTML;
    }

    handleStartMinigame() {
        const gameType = this.minigameSelect.value;

        // ================== LOGIC PHÂN LUỒNG MỚI ==================
        if (gameType === 'sliding_puzzle') {
            // Logic riêng cho Puzzle Trượt
            const allPlayers = this.getRoomPlayers();
            const nightStates = this.getNightStates();
            const lastNight = nightStates.length > 0 ? nightStates[nightStates.length - 1] : null;

            if (!lastNight || !lastNight.isFinished) {
                alert("Lỗi: Phải có ít nhất một đêm đã kết thúc để xác định người chơi đã chết.");
                return;
            }

            const { finalStatus } = calculateNightStatus(lastNight, allPlayers);
            const deadPlayers = allPlayers.filter(p => finalStatus[p.id] && !finalStatus[p.id].isAlive);

            if (deadPlayers.length === 0) {
                alert("Không có người chơi nào chết để tham gia mini game này.");
                return;
            }
            
            const participants = deadPlayers.reduce((acc, p) => {
                acc[p.id] = p.name;
                return acc;
            }, {});

            const playerProgress = {};
            for (const pId in participants) {
                playerProgress[pId] = {
                    board: this.createSolvablePuzzle(),
                    moves: 0,
                };
            }

            const newPuzzleGame = {
                status: 'active',
                gameType: 'sliding_puzzle',
                title: 'Mini Game: Giải Mã Mê Cung',
                participants,
                playerProgress,
                winnerId: null,
                startTime: firebase.database.ServerValue.TIMESTAMP
            };
            
            // Đẩy vào đường dẫn mới /slidingPuzzles
            this.database.ref(`rooms/${this.roomId}/slidingPuzzles`).push(newPuzzleGame);
            alert("Đã bắt đầu mini game 'Giải Mã Mê Cung' cho những người chơi đã chết.");
            return; 
        } 
        
        // ================== LOGIC CŨ CHO CÁC GAME CÒN LẠI ==================
        if (gameType === 'returning_spirit' || gameType === 'russian_roulette') {
            const allPlayers = this.getRoomPlayers();
            this.createParticipantSelectionModal(allPlayers, (participants) => {
                if (gameType === 'returning_spirit') {
                    this.startReturningSpiritGame(participants);
                } else if (gameType === 'russian_roulette') {
                     const newMinigameState = {
                        status: 'active',
                        gameType: 'russian_roulette',
                        title: 'Mini Game: Cò Quay Nga',
                        participants,
                        bets: {}
                    };
                    this.database.ref(`rooms/${this.roomId}/minigameState`).set(newMinigameState);
                }
            });
            return;
        }

        if (gameType === 'bomber_game') {
            const allPlayers = this.getRoomPlayers().filter(p => p.isAlive);
            this.createBomberSetupModal(allPlayers, (participants, passLimit) => {
                this.startBomberGame(participants, passLimit);
            });
            return;
        }
        
        // Các game còn lại cho người sống
        const nightStates = this.getNightStates();
        const roomPlayers = this.getRoomPlayers();
        const lastNight = nightStates[nightStates.length - 1];

        if (!lastNight) {
            alert("Chưa có đêm nào bắt đầu!");
            return;
        }
        const { finalStatus } = calculateNightStatus(lastNight, roomPlayers);
        const livingPlayers = roomPlayers.filter(p => finalStatus[p.id]?.isAlive);

        if (livingPlayers.length < 1) {
            alert("Cần ít nhất 1 người chơi còn sống để bắt đầu mini game.");
            return;
        }

        const participants = livingPlayers.reduce((acc, p) => {
            acc[p.id] = p.name;
            return acc;
        }, {});

        let newMinigameState = {
            status: 'active',
            gameType,
            participants,
            startTime: firebase.database.ServerValue.TIMESTAMP,
            choices: null,
            submissions: null,
            results: null
        };

        if (gameType === 'night_of_trust') {
            if (livingPlayers.length < 3) {
                 alert("Cần ít nhất 3 người chơi còn sống để bắt đầu mini game này.");
                 return;
            }
            newMinigameState.title = "Mini Game: Đêm của Lòng Tin";
        } else if (gameType === 'math_whiz') {
            newMinigameState.title = "Mini Game: Thần Đồng Toán Học";
            newMinigameState.endTime = Date.now() + 10000;
            newMinigameState.problem = this.generateMathProblem();
        }

        this.database.ref(`rooms/${this.roomId}/minigameState`).set(newMinigameState);
    }

    generateMathProblem() {
        const ops = ['+', '-', '*'];
        const op = ops[Math.floor(Math.random() * ops.length)];
        let num1, num2, correctAnswer;

        if (op === '+') {
            num1 = Math.floor(Math.random() * 50) + 1;
            num2 = Math.floor(Math.random() * 50) + 1;
            correctAnswer = num1 + num2;
        } else if (op === '-') {
            num1 = Math.floor(Math.random() * 50) + 20;
            num2 = Math.floor(Math.random() * 20) + 1;
            correctAnswer = num1 - num2;
        } else { // op === '*'
            num1 = Math.floor(Math.random() * 9) + 2;
            num2 = Math.floor(Math.random() * 9) + 2;
            correctAnswer = num1 * num2;
        }

        const answers = new Set([correctAnswer]);
        while (answers.size < 3) {
            const offset = Math.floor(Math.random() * 10) + 1;
            const wrongAnswer = correctAnswer + (Math.random() > 0.5 ? offset : -offset);
            if (wrongAnswer !== correctAnswer) {
                answers.add(wrongAnswer);
            }
        }
        
        const shuffledAnswers = Array.from(answers).sort(() => Math.random() - 0.5);

        return {
            question: `${num1} ${op} ${num2}`,
            answers: shuffledAnswers,
            correctAnswer: correctAnswer
        };
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

        let announcementText = "";
        const updates = {};
        
        if (currentState.gameType === 'russian_roulette') {
            const bets = currentState.bets || {};
            const participants = currentState.participants || {};
            
            const results = {
                bets: {},
                chosenOneId: null,
                maxBet: 0,
                outcome: "Chưa xác định",
                isTie: false,
                participants: participants
            };

            for(const pId in participants) {
                results.bets[participants[pId]] = bets[pId] ? `${bets[pId]} viên` : 'Chưa cược';
            }

            const betEntries = Object.entries(bets);

            if (betEntries.length === 0) {
                results.outcome = "Không có ai đặt cược.";
                updates[`/minigameState/status`] = 'finished';
                announcementText = "Mini game Cò Quay Nga kết thúc. Không có ai đặt cược.";
            } else {
                let maxBet = -1;
                betEntries.forEach(([, bet]) => {
                    if (bet > maxBet) maxBet = bet;
                });

                const playersWithMaxBet = betEntries.filter(([, bet]) => bet === maxBet);

                if (playersWithMaxBet.length > 1) {
                    results.isTie = true;
                    results.outcome = `Hòa ở mức cược cao nhất (${maxBet} viên). Không ai phải bắn.`;
                    updates[`/minigameState/status`] = 'finished';
                    announcementText = `Mini game Cò Quay Nga: Có ${playersWithMaxBet.length} người cùng cược ${maxBet} viên. Không ai được chọn.`;
                } else {
                    const [chosenOneId] = playersWithMaxBet[0];
                    results.chosenOneId = chosenOneId;
                    results.maxBet = maxBet;
                    updates[`/minigameState/status`] = 'reveal_choice'; // Chuyển sang trạng thái mới
                    announcementText = `Mini game Cò Quay Nga: ${participants[chosenOneId]} đã được chọn với mức cược cao nhất!`;
                }
            }
            updates[`/minigameState/results`] = results;
        } 
        else {
             // Logic của các game khác giữ nguyên
            updates[`/minigameState/status`] = 'finished';
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
    
                deadPlayerIds.forEach(id => {
                    updates[`/players/${id}/isAlive`] = false;
                });
                
                const nightStates = this.getNightStates();
                if (nightStates.length > 0) {
                    const lastNightState = nightStates[nightStates.length - 1];
                    deadPlayerIds.forEach(id => {
                        if (lastNightState.playersStatus[id]) {
                            lastNightState.playersStatus[id].isAlive = false;
                        }
                    });
                    await this.database.ref(`rooms/${this.roomId}/nightNotes`).set(nightStates);
                }
                
                announcementText = `Mini game "Đêm của Lòng Tin" đã kết thúc. ${deadPlayerNames.length > 0 ? `Người không nhận được sự tin tưởng và phải chết là: ${deadPlayerNames.join(', ')}.` : 'Tất cả mọi người đều an toàn.'}`;
                updates[`/minigameState/results`] = { trustCounts, deadPlayerNames };
                alert(`Mini game kết thúc! Người chết: ${deadPlayerNames.join(', ') || 'Không có ai'}.`);
            
            } else if (currentState.gameType === 'math_whiz') {
                const submissions = currentState.submissions || {};
                const { correctAnswer } = currentState.problem;
    
                const correctSubmissions = Object.entries(submissions)
                    .filter(([, sub]) => sub.answer == correctAnswer && typeof sub.timestamp === 'number' && typeof currentState.startTime === 'number')
                    .sort(([, a], [, b]) => a.timestamp - b.timestamp);
    
                if (correctSubmissions.length > 0) {
                    const [winnerId, winnerSubmission] = correctSubmissions[0];
                    const winnerName = currentState.participants[winnerId];
                    const timeToAnswer = (winnerSubmission.timestamp - currentState.startTime) / 1000;
                    
                    announcementText = `Mini game "Thần Đồng Toán Học" đã kết thúc. Chúc mừng ${winnerName} đã trả lời đúng và nhanh nhất!`;
                    updates[`/minigameState/results`] = { 
                        winnerId, 
                        winnerName, 
                        timeToAnswer,
                        problem: currentState.problem,
                        allSubmissions: submissions
                    };
                     alert(`Mini game kết thúc! Người thắng cuộc: ${winnerName}.`);
                } else {
                    announcementText = `Mini game "Thần Đồng Toán Học" đã kết thúc. Rất tiếc, không có ai trả lời đúng.`;
                    updates[`/minigameState/results`] = { 
                        winnerName: null, 
                        problem: currentState.problem,
                        allSubmissions: submissions
                    };
                    alert(`Mini game kết thúc! Không có ai thắng.`);
                }
            } else if (currentState.gameType === 'returning_spirit') {
                const winnerId = currentState.winner || null;
                const winnerName = winnerId ? currentState.participants[winnerId] : null;
                
                if(winnerName) {
                    announcementText = `Mini game "Vong Hồn Trở Lại" đã kết thúc. Chúc mừng ${winnerName} đã tìm thấy con đường đúng và chiến thắng!`;
                } else {
                    announcementText = `Mini game "Vong Hồn Trở Lại" đã kết thúc. Rất tiếc, không có ai chiến thắng.`;
                }
                updates[`/minigameState/results`] = { 
                    winnerId: winnerId,
                    participants: currentState.participants,
                    correctPath: currentState.correctPath
                };
                alert(`Mini game kết thúc! Người thắng cuộc: ${winnerName || 'Không có ai'}.`);
            } else if (currentState.gameType === 'bomber_game') {
                if (currentState.results && currentState.results.loser) {
                    const loserName = currentState.participants[currentState.results.loser.id];
                    const reason = currentState.results.loser.reason;
                    let reasonText = '';
                    switch (reason) {
                        case 'timeout': reasonText = 'hết giờ'; break;
                        case 'pass_limit': reasonText = 'hết lượt chuyền'; break;
                        default: reasonText = 'lý do khác';
                    }
                    announcementText = `Mini game Kẻ Gài Boom đã kết thúc. ${loserName} đã bị nổ tung vì ${reasonText}.`;
                } else {
                    const finalHolder = currentState.participants[currentState.currentHolderId];
                    announcementText = `Mini game Kẻ Gài Boom đã được Quản trò kết thúc. ${finalHolder} là người cuối cùng giữ boom.`;
                    updates[`/minigameState/results`] = {
                        loser: { id: currentState.currentHolderId, reason: 'admin_force_end' },
                        participants: currentState.participants,
                        passHistory: currentState.passHistory
                    };
                }
                alert(`Đã kết thúc mini game. ${announcementText}`);
            }
        }
        
        updates['/publicData/latestAnnouncement'] = {
            message: announcementText,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        };

        await this.database.ref(`rooms/${this.roomId}`).update(updates);

        this.endMinigameBtn.disabled = false;
        this.endMinigameBtn.textContent = "Kết Thúc & Xử Lý";
    }
}