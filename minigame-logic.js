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

        // Lấy các DOM elements
        this.minigameSection = document.getElementById('minigame-section');
        this.minigameSelect = document.getElementById('minigame-select');
        this.startMinigameBtn = document.getElementById('start-minigame-btn');
        this.endMinigameBtn = document.getElementById('end-minigame-btn');
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
                this.minigameLiveChoices.style.display = 'none';
            } else if (state.status === 'active') {
                this.startMinigameBtn.style.display = 'none';
                this.endMinigameBtn.style.display = 'inline-block';
                this.minigameResultsContainer.style.display = 'none';
                this.minigameSelect.disabled = true;
                this.minigameLiveChoices.style.display = 'block';
                this.renderLiveChoices(state);
            } else if (state.status === 'finished') {
                this.startMinigameBtn.style.display = 'inline-block';
                this.endMinigameBtn.style.display = 'none';
                this.minigameResultsContainer.style.display = 'block';
                this.minigameSelect.disabled = false;
                this.minigameLiveChoices.style.display = 'none';
                this.renderResults(state);
            }

            if (state && state.gameType === 'bomber_game' && !state.loser) {
                this.handleBomberGameTick(state);
            } else {
                if (this.bomberGameTimeout) clearTimeout(this.bomberGameTimeout);
            }
        });
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

        if (state.passHistory.length > state.passLimit) {
            const loserId = state.currentHolderId;
            const updates = {
                loser: { id: loserId, reason: 'pass_limit' }
            };
            this.database.ref(`rooms/${this.roomId}/minigameState`).update(updates);
            return;
        }

        const timeSincePass = Date.now() - state.passDeadline;
        const timeRemaining = 12000 - timeSincePass;

        if (timeRemaining <= 0) {
            const loserId = state.currentHolderId;
            const updates = {
                loser: { id: loserId, reason: 'timeout' }
            };
            this.database.ref(`rooms/${this.roomId}/minigameState`).update(updates);
        } else {
            this.bomberGameTimeout = setTimeout(() => {
                // Refetch state to avoid acting on stale data
                this.database.ref(`rooms/${this.roomId}/minigameState`).once('value', snapshot => {
                    const freshState = snapshot.val();
                    if (freshState && freshState.status === 'active' && !freshState.loser) {
                       this.handleBomberGameTick(freshState);
                    }
                });
            }, timeRemaining + 200);
        }
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
            if (state.loser) {
                const loserName = state.participants[state.loser.id];
                const reason = state.loser.reason === 'timeout' ? 'hết giờ' : 'hết lượt chuyền';
                this.minigameLiveChoicesList.innerHTML = `<li><strong style="color:var(--danger-color)">KẾT THÚC:</strong> ${loserName} đã nổ tung vì ${reason}.</li>`;
            } else if (state.currentHolderId) {
                const holderName = state.participants[state.currentHolderId];
                const passCount = state.passHistory.length - 1;
                const remaining = Math.max(0, Math.round((state.passDeadline + 12000 - Date.now()) / 1000));
                this.minigameLiveChoicesList.innerHTML = `
                    <li><strong>Người giữ boom:</strong> ${holderName}</li>
                    <li><strong>Thời gian còn lại:</strong> ${remaining}s</li>
                    <li><strong>Lượt chuyền:</strong> ${passCount} / ${state.passLimit}</li>
                `;
            }
        }
    }

    renderResults(state) {
        let resultsHTML = '';
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
        } else if (state.gameType === 'russian_roulette') {
            const { bets, chosenOne, outcome, isTie } = state.results;
            resultsHTML = '<h4>Chi tiết cược:</h4><ul>';
            for (const name in bets) {
                resultsHTML += `<li><strong>${name}:</strong> ${bets[name]}</li>`;
            }
            resultsHTML += '</ul><hr style="border-color: var(--border-color); margin: 10px 0;">';
            
            if (isTie) {
                resultsHTML += `<p><strong>Kết quả:</strong> ${outcome}</p>`;
            } else if (chosenOne) {
                resultsHTML += `<p><strong>Người được chọn:</strong> ${chosenOne}</p>`;
                resultsHTML += `<p><strong>Kết cục:</strong> ${outcome}</p>`;
            } else {
                resultsHTML += `<p><strong>Kết quả:</strong> Không có ai đặt cược.</p>`;
            }
        } else if (state.gameType === 'bomber_game') {
            const { loser, participants, passHistory } = state.results;
            if (loser) {
                const loserName = participants[loser.id];
                const reason = loser.reason === 'timeout' ? 'giữ boom quá lâu' : 'hết lượt chuyền';
                resultsHTML = `<p><strong>Người thua cuộc:</strong> ${loserName}</p>`;
                resultsHTML += `<p><strong>Lý do:</strong> ${reason}.</p>`;
            }
            const historyText = passHistory.map(pId => participants[pId]).join(' → ');
            resultsHTML += `<h4>Lịch sử chuyền boom:</h4><p>${historyText}</p>`;
        }
        
        this.minigameResultsDetails.innerHTML = resultsHTML;
    }

    handleStartMinigame() {
        const gameType = this.minigameSelect.value;
        
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
            const allPlayers = this.getRoomPlayers();
            this.createBomberSetupModal(allPlayers, (participants, passLimit) => {
                this.startBomberGame(participants, passLimit);
            });
            return;
        }

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
            newMinigameState.endTime = Date.now() + 10000; // 10 giây
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
        } else if (currentState.gameType === 'russian_roulette') {
            const bets = currentState.bets || {};
            const participants = currentState.participants || {};
            let results = {
                bets: {},
                chosenOne: null,
                outcome: "Chưa xác định",
                isTie: false,
            };

            for(const pId in participants) {
                results.bets[participants[pId]] = bets[pId] ? `${bets[pId]} viên` : 'Chưa cược';
            }

            const betEntries = Object.entries(bets);

            if (betEntries.length === 0) {
                announcementText = "Mini game Cò Quay Nga kết thúc. Không có ai đặt cược.";
            } else {
                let maxBet = -1;
                betEntries.forEach(([, bet]) => {
                    if (bet > maxBet) maxBet = bet;
                });

                const playersWithMaxBet = betEntries.filter(([, bet]) => bet === maxBet);

                if (playersWithMaxBet.length > 1) {
                    results.isTie = true;
                    results.outcome = `Hòa ở mức cược cao nhất (${maxBet} viên). Tất cả đều thua.`;
                    announcementText = `Mini game Cò Quay Nga: Có ${playersWithMaxBet.length} người cùng cược ${maxBet} viên. Không ai được chọn.`;
                } else {
                    const [chosenOneId] = playersWithMaxBet[0];
                    results.chosenOne = participants[chosenOneId];
                    
                    let survived = true;
                    if (maxBet === 8) {
                        if (Math.random() > 0.05) survived = false;
                    } else {
                        if (Math.random() < (maxBet / 8.0)) survived = false;
                    }

                    if (survived) {
                        results.outcome = `${results.chosenOne} đã SỐNG SÓT sau khi bắn với ${maxBet} viên đạn!`;
                        announcementText = `Mini game Cò Quay Nga: ${results.chosenOne} đã thắng và sống sót với ${maxBet} viên đạn!`;
                    } else {
                        results.outcome = `${results.chosenOne} đã CHẾT sau khi bắn với ${maxBet} viên đạn!`;
                        announcementText = `Mini game Cò Quay Nga: ${results.chosenOne} đã thua và bỏ mạng với ${maxBet} viên đạn!`;
                    }
                }
            }
            updates[`/minigameState/results`] = results;
            alert(`Mini game kết thúc! ${announcementText}`);
        } else if (currentState.gameType === 'bomber_game') {
            const loserId = currentState.currentHolderId;
            announcementText = `Mini game Kẻ Gài Boom đã được Quản trò kết thúc. ${currentState.participants[loserId]} là người cuối cùng giữ boom.`;
            updates[`/minigameState/loser`] = { id: loserId, reason: 'admin_force_end' };
            updates[`/minigameState/results`] = {
                loser: { id: loserId, reason: 'Quản trò ép kết thúc' },
                participants: currentState.participants,
                passHistory: currentState.passHistory
            };
            alert("Đã ép kết thúc mini game.");
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