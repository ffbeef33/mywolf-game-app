// =================================================================
// === minigame-logic.js - Module quản lý Mini Game (Đã cập nhật) ===
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
        }
        
        this.minigameResultsDetails.innerHTML = resultsHTML;
    }

    handleStartMinigame() {
        const gameType = this.minigameSelect.value;
        
        if (gameType === 'returning_spirit') {
            const allPlayers = this.getRoomPlayers();
            this.createParticipantSelectionModal(allPlayers, (participants) => {
                this.startReturningSpiritGame(participants);
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
            const winnerId = currentState.winner || null; // SỬA LỖI 2
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