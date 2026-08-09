// Tribal Wars - Авточеканка монет
// Скрипт для автоматического запуска и отмены чеканки монет в деревнях с особняком

(function() {
    'use strict';
    
    const SnobMinter = {
        villages: [],
        selectedVillages: new Set(),
        isRunning: false,
        currentLang: 'ru',
        mintResults: [],
        baseUrl: '',
        lastResults: null,
        lastUpdateTime: null,
        autoUpdateInterval: null,
        nobleInfo: {
            canTrain: 0,
            currentLimit: 0,
            missingCoins: 0,
            haveCoins: 0
        },
        
        translations: {
            ru: {
                title: "🏰 Авточеканка монет",
                loading: "Загрузка списка деревень...",
                noVillages: "❌ Деревни с особняком не найдены",
                villagesFound: "Найдено деревень с особняком: {count}",
                selectAll: "✅ Выбрать все",
                deselectAll: "❌ Снять все",
                startMinting: "▶️ Запустить чеканку",
                stopMinting: "⏹️ Остановить чеканку",
                stop: "⏹️",
                start: "▶️",
                stopAll: "⏹️ Остановить все",
                village: "Деревня",
                coordinates: "Координаты",
                snob: "Особняк",
                status: "Статус чеканки",
                waiting: "Ожидание",
                minting: "Чеканка...",
                success: "✅ Успешно",
                error: "❌ Ошибка",
                alreadyMinting: "⏳ Уже чеканит",
                progress: "Прогресс",
                completed: "✅ Чеканка завершена!",
                stopCompleted: "✅ Остановка завершена!",
                results: "Результаты:",
                successCount: "✅ Успешно: {count}",
                errorCount: "❌ Ошибок: {count}",
                alreadyCount: "⏳ Уже чеканили: {count}",
                total: "📊 Всего: {count}",
                close: "✕",
                help: "❓ Помощь",
                helpTitle: "📖 Помощь по авточеканке",
                mintingActive: "✅ Активна",
                mintingInactive: "❌ Не активна",
                coinsMinted: "Монет",
                completion: "Завершение",
                duration: "Длительность",
                cancelSuccess: "✅ Чеканка остановлена",
                cancelError: "❌ Ошибка при остановке",
                cancelConfirm: "Остановить чеканку в деревне {village}?",
                lastUpdate: "Последнее обновление",
                autoStart: "🔄 Автозапуск",
                nobleInfo: "Информация о дворянах",
                canTrain: "Можно обучить дворян",
                currentLimit: "Текущий лимит дворянства",
                missingCoins: "Не хватает до лимита",
                haveCoins: "Уже имеется для лимита",
                helpText: `
                    <b>Как работает скрипт:</b><br>
                    1. Получает список всех ваших деревень<br>
                    2. Определяет, в каких деревнях построен особняк<br>
                    3. Проверяет статус чеканки в каждой деревне<br>
                    4. Для выбранных деревень открывает страницу особняка и нажимает кнопку<br><br>
                    <b>Статусы чеканки:</b><br>
                    • ✅ Активна - чеканка уже запущена<br>
                    • ❌ Не активна - чеканка не запущена<br>
                    • Показывает количество собранных монет<br>
                    • Показывает время завершения или длительность<br><br>
                    <b>Действия:</b><br>
                    • Запустить чеканку - активирует авточканку в выбранных деревнях<br>
                    • Остановить - отменяет авточканку в конкретной деревне<br>
                    • Остановить все - отменяет авточканку во всех активных деревнях<br>
                    • Автозапуск - автоматически запускает чеканку при её завершении<br><br>
                    <b>Важно:</b><br>
                    • Скрипт работает только при наличии особняка<br>
                    • Операции выполняются по одной деревне за раз<br>
                    • Между операциями есть пауза 2 секунды<br>
                    • Автообновление статусов каждые 5-15 минут
                `
            }
        },
        
        t: function(key) {
            return this.translations[this.currentLang][key] || key;
        },
        
        formatNumber: function(num) {
            if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
            if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
            return num.toString();
        },
        
        sleep: function(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        },
        
        getBaseUrl: function() {
            if (this.baseUrl) return this.baseUrl;
            const currentUrl = window.location.href;
            const match = currentUrl.match(/^(https?:\/\/[^\/]+)/);
            if (match) {
                this.baseUrl = match[1];
                return this.baseUrl;
            }
            this.baseUrl = window.location.origin;
            return this.baseUrl;
        },
        
        // Сохранение состояния автозапуска
        saveAutoStartState: function() {
            try {
                const state = {};
                for (const v of this.villages) {
                    state[v.id] = v.autoStart;
                }
                sessionStorage.setItem('snob_auto_start_state', JSON.stringify(state));
            } catch(e) {}
        },
        
        loadAutoStartState: function() {
            try {
                const saved = sessionStorage.getItem('snob_auto_start_state');
                if (saved) {
                    const state = JSON.parse(saved);
                    for (const v of this.villages) {
                        if (state[v.id] !== undefined) {
                            v.autoStart = state[v.id];
                        }
                    }
                }
            } catch(e) {}
        },
        
        // Получение информации о дворянах
        fetchNobleInfo: function() {
            return new Promise((resolve) => {
                const baseUrl = this.getBaseUrl();
                const firstVillage = this.villages[0];
                if (!firstVillage) {
                    resolve();
                    return;
                }
                
                const url = `${baseUrl}/game.php?screen=snob&village=${firstVillage.id}`;
                
                fetch(url, {
                    method: 'GET',
                    credentials: 'include',
                    headers: {
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                        'Accept-Language': 'ru,en;q=0.9'
                    }
                })
                .then(response => response.text())
                .then(html => {
                    this.parseNobleInfo(html);
                    resolve();
                })
                .catch(() => {
                    resolve();
                });
            });
        },
        
        parseNobleInfo: function(html) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            
            const rows = tempDiv.querySelectorAll('tr');
            
            for (const row of rows) {
                const cells = row.querySelectorAll('td');
                if (cells.length < 2) continue;
                
                const label = cells[0].textContent.trim();
                const value = cells[1].textContent.trim();
                
                if (label.includes('Можно обучить дворян')) {
                    this.nobleInfo.canTrain = parseInt(value) || 0;
                }
                else if (label.includes('Текущий лимит дворянства')) {
                    this.nobleInfo.currentLimit = parseInt(value) || 0;
                }
                else if (label.includes('Не хватает до лимита дворян')) {
                    const match = value.match(/(\d+)/);
                    if (match) {
                        this.nobleInfo.missingCoins = parseInt(match[1]) || 0;
                    }
                }
                else if (label.includes('Уже имеется для лимита дворян')) {
                    const match = value.match(/(\d+)/);
                    if (match) {
                        this.nobleInfo.haveCoins = parseInt(match[1]) || 0;
                    }
                }
            }
            
            // Альтернативный поиск через регулярные выражения
            if (this.nobleInfo.currentLimit === 0) {
                const limitMatch = html.match(/Текущий лимит дворянства:<\/td>\s*<td[^>]*>(\d+)/);
                if (limitMatch) {
                    this.nobleInfo.currentLimit = parseInt(limitMatch[1]) || 0;
                }
            }
            
            if (this.nobleInfo.canTrain === 0) {
                const trainMatch = html.match(/Можно обучить дворян:<\/th>\s*<th[^>]*>(\d+)/);
                if (trainMatch) {
                    this.nobleInfo.canTrain = parseInt(trainMatch[1]) || 0;
                }
            }
            
            if (this.nobleInfo.missingCoins === 0) {
                const missingMatch = html.match(/Не хватает до лимита дворян\s*\d+:<\/td>\s*<td[^>]*>(\d+)\s*монет/);
                if (missingMatch) {
                    this.nobleInfo.missingCoins = parseInt(missingMatch[1]) || 0;
                }
            }
            
            if (this.nobleInfo.haveCoins === 0) {
                const haveMatch = html.match(/Уже имеется для лимита дворян\s*\d+:<\/td>\s*<td[^>]*>(\d+)\s*монет/);
                if (haveMatch) {
                    this.nobleInfo.haveCoins = parseInt(haveMatch[1]) || 0;
                }
            }
            
            this.updateNobleInfoUI();
        },
        
        updateNobleInfoUI: function() {
            const container = document.getElementById('snob-noble-info');
            if (!container) return;
            
            container.innerHTML = `
                <div style="display: flex; gap: 20px; flex-wrap: nowrap; padding: 8px 12px; background: #f5f0e0; border-radius: 6px; border: 1px solid #e0d5c0;">
                    <span><strong>${this.t('canTrain')}:</strong> ${this.nobleInfo.canTrain}</span>
                    <span><strong>${this.t('currentLimit')}:</strong> ${this.nobleInfo.currentLimit}</span>
                    <span><strong>${this.t('missingCoins')}:</strong> ${this.nobleInfo.missingCoins} монет</span>
                    <span><strong>${this.t('haveCoins')}:</strong> ${this.nobleInfo.haveCoins} монет</span>
                </div>
            `;
        },
        
        // Получение списка деревень с особняком
        fetchVillagesWithSnob: function() {
            return new Promise((resolve, reject) => {
                const baseUrl = this.getBaseUrl();
                const url = `${baseUrl}/game.php?screen=overview_villages&mode=buildings`;
                
                fetch(url, {
                    method: 'GET',
                    credentials: 'include',
                    headers: {
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                        'Accept-Language': 'ru,en;q=0.9'
                    }
                })
                .then(response => response.text())
                .then(html => {
                    this.parseVillagesWithSnob(html);
                    resolve(this.villages);
                })
                .catch(error => reject(error));
            });
        },
        
        parseVillagesWithSnob: function(html) {
			const tempDiv = document.createElement('div');
			tempDiv.innerHTML = html;
			
			const villageContainers = tempDiv.querySelectorAll('table.overview-container-item');
			this.villages = [];
			
			for (const container of villageContainers) {
				const containerId = container.getAttribute('id');
				if (!containerId) continue;
				
				let villageId = containerId;
				if (containerId.startsWith('v_')) {
					villageId = containerId.replace('v_', '');
				}
				
				const quickeditSpan = container.querySelector('.quickedit-vn');
				let name = '', coord = '';
				if (quickeditSpan) {
					const labelSpan = quickeditSpan.querySelector('.quickedit-label');
					if (labelSpan) {
						const fullText = labelSpan.textContent.trim();
						const coordMatch = fullText.match(/\((\d{1,3}\|\d{1,3})\)/);
						if (coordMatch) {
							coord = coordMatch[1];
							name = fullText.replace(/\(\d{1,3}\|\d{1,3}\)/, '').trim();
						} else {
							name = fullText;
							coord = '?|?';
						}
						name = name.replace(/\s*K\d{1,2}\s*$/, '').trim();
					}
				}
				
				const snobCell = container.querySelector('.building_snob');
				if (!snobCell) continue;
				
				const levelText = snobCell.textContent.trim();
				const level = parseInt(levelText) || 0;
				if (level < 1) continue;
				
				const hiddenSpan = snobCell.querySelector('.hidden');
				if (hiddenSpan && parseInt(hiddenSpan.textContent.trim()) === 0) continue;
				
				let warehouse = 0;
				const storageCell = container.querySelector('.building_storage');
				if (storageCell) {
					const storageText = storageCell.textContent.trim();
					const hiddenSpanStorage = storageCell.querySelector('.hidden');
					if (hiddenSpanStorage && parseInt(hiddenSpanStorage.textContent.trim()) === 0) {
						warehouse = 0;
					} else {
						warehouse = parseInt(storageText) || 0;
					}
				}
				
				let queueCount = 0;
				const orderUl = container.querySelector('.building_order');
				if (orderUl) {
					const images = orderUl.querySelectorAll('img');
					queueCount = images.length;
				}
				
				this.villages.push({
					id: villageId,
					coord: coord,
					name: name || `Деревня ${coord}`,
					level: level,
					warehouse: warehouse,
					queueCount: queueCount,
					hasBuildingQueue: queueCount > 0,
					isMinting: false,
					selected: false,
					status: 'waiting',
					mintingStatus: null,
					statusLoaded: false,
					autoStart: false
				});
			}
			
			this.loadAutoStartState();
		},
        
        // Получение статуса чеканки для деревни
        fetchMintingStatus: function(villageId) {
            return new Promise((resolve) => {
                const baseUrl = this.getBaseUrl();
                const url = `${baseUrl}/game.php?screen=snob&village=${villageId}`;
                
                fetch(url, {
                    method: 'GET',
                    credentials: 'include',
                    headers: {
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                        'Accept-Language': 'ru,en;q=0.9'
                    }
                })
                .then(response => response.text())
                .then(html => {
                    const status = this.parseMintingStatus(html);
                    resolve(status);
                })
                .catch(() => {
                    resolve({ active: false, coins: 0, completion: null, duration: null });
                });
            });
        },
        
        parseMintingStatus: function(html) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            
            const statusCell = tempDiv.querySelector('.auto-minting-cell');
            if (!statusCell) {
                return { active: false, coins: 0, completion: null, duration: null };
            }
            
            const result = {
                active: false,
                coins: 0,
                completion: null,
                duration: null
            };
            
            const cancelForm = statusCell.querySelector('form[action*="cancel_auto_minting_session"]');
            if (cancelForm) {
                result.active = true;
                
                const textNodes = statusCell.querySelectorAll('div');
                for (const node of textNodes) {
                    const text = node.textContent.trim();
                    const coinMatch = text.match(/(\d+)\s*золотых монет/);
                    if (coinMatch) {
                        result.coins = parseInt(coinMatch[1]) || 0;
                    }
                    const completionMatch = text.match(/Завершение:\s*(.+)/);
                    if (completionMatch) {
                        result.completion = completionMatch[1].trim();
                    }
                }
            } else {
                const activateForm = statusCell.querySelector('form[action*="start_auto_minting_session"]');
                if (activateForm) {
                    result.active = false;
                    
                    const durationSpan = statusCell.querySelector('span');
                    if (durationSpan) {
                        const durationText = durationSpan.textContent.trim();
                        if (durationText.includes('Длительность')) {
                            result.duration = durationText.replace('Длительность', '').trim();
                        }
                    }
                }
            }
            
            return result;
        },
        
        // Загрузка статусов для всех деревень
        loadAllMintingStatuses: async function(showProgress = false) {
            const total = this.villages.length;
            let loaded = 0;
            
            if (showProgress) {
                const progressDiv = document.getElementById('snob-progress');
                const progressText = document.getElementById('snob-progress-text');
                const progressBar = document.getElementById('snob-progress-bar');
                if (progressDiv) progressDiv.style.display = 'block';
                if (progressText) progressText.textContent = 'Обновление статусов...';
                if (progressBar) progressBar.value = 0;
            }
            
            await this.fetchNobleInfo();
            
            for (const village of this.villages) {
                const status = await this.fetchMintingStatus(village.id);
                const wasMinting = village.isMinting;
                village.mintingStatus = status;
                village.isMinting = status.active;
                village.statusLoaded = true;
                
                // Автозапуск: если чеканка завершилась и стоит флаг автозапуска
                if (wasMinting && !status.active && village.autoStart) {
                    console.log(`[SnobMinter] Auto-starting minting for ${village.name} (${village.coord})`);
                    await this.startMinting(village.id);
                    const newStatus = await this.fetchMintingStatus(village.id);
                    village.mintingStatus = newStatus;
                    village.isMinting = newStatus.active;
                }
                
                loaded++;
                if (loaded % 3 === 0 || loaded === total) {
                    if (showProgress) {
                        const progressBar = document.getElementById('snob-progress-bar');
                        if (progressBar) {
                            progressBar.value = (loaded / total) * 100;
                        }
                        const progressText = document.getElementById('snob-progress-text');
                        if (progressText) {
                            progressText.textContent = `Обновление статусов... ${loaded}/${total}`;
                        }
                    }
                }
            }
            
            this.lastUpdateTime = new Date();
            this.updateLastUpdateTime();
            
            if (showProgress) {
                const progressDiv = document.getElementById('snob-progress');
                if (progressDiv) {
                    setTimeout(() => {
                        progressDiv.style.display = 'none';
                    }, 2000);
                }
            }
            
            console.log(`[SnobMinter] Statuses updated for ${total} villages`);
            
            await this.refreshTable();
        },
        
        updateLastUpdateTime: function() {
            const el = document.getElementById('snob-last-update');
            if (el && this.lastUpdateTime) {
                const timeStr = this.lastUpdateTime.toLocaleTimeString();
                el.textContent = `${this.t('lastUpdate')}: ${timeStr}`;
            }
        },
        
        // Обновление таблицы с данными
		refreshTable: async function() {
			const tbody = document.getElementById('snob-tbody');
			if (!tbody) return;
			
			let html = '';
			for (const v of this.villages) {
				const isChecked = this.selectedVillages.has(v.id);
				const isDisabled = this.isRunning || v.isMinting;
				
				let mintStatusText = v.isMinting ? '✅ Активна' : '❌ Не активна';
				let mintStatusColor = v.isMinting ? '#28a745' : '#dc3545';
				
				let coinsText = '0';
				let completionText = '—';
				
				if (v.mintingStatus) {
					if (v.mintingStatus.active) {
						coinsText = v.mintingStatus.coins || '0';
						completionText = v.mintingStatus.completion || '—';
					} else if (v.mintingStatus.duration) {
						completionText = v.mintingStatus.duration;
					}
				}
				
				const actionBtnText = v.isMinting ? '⏹️' : '▶️';
				const actionBtnClass = v.isMinting ? 'btn-confirm-no' : 'btn-confirm-yes';
				// Кнопка активна только если:
				// 1. Не выполняется никакая операция (this.isRunning === false)
				// 2. Для STOP - если чеканка активна
				// 3. Для START - если чеканка не активна (всегда активна, если не выполняется операция)
				const actionBtnDisabled = this.isRunning ? true : false;
				
				html += `
					<tr data-id="${v.id}" style="${v.isMinting ? 'background: #fff3cd;' : ''}">
						<td style="padding: 8px; text-align: center;">
							<input type="checkbox" data-id="${v.id}" ${isChecked ? 'checked' : ''} ${isDisabled ? 'disabled' : ''}>
						</td>
						<td style="padding: 8px;">
							${v.name}
						</td>
						<td style="padding: 8px; text-align: center;">
							${v.coord}
						</td>
						<td style="padding: 8px; text-align: center;">
							<span style="color: ${mintStatusColor}; font-weight: bold;">${mintStatusText}</span>
						</td>
						<td style="padding: 8px; text-align: center; font-weight: bold;">
							${coinsText}
						</td>
						<td style="padding: 8px; text-align: center; font-size: 11px;">
							${completionText}
						</td>
						<td style="padding: 8px; text-align: center;">
							<input type="checkbox" class="snob-auto-start" data-id="${v.id}" ${v.autoStart ? 'checked' : ''} ${this.isRunning ? 'disabled' : ''}>
						</td>
						<td style="padding: 8px; text-align: center;">
							<button class="snob-action-btn ${actionBtnClass}" data-id="${v.id}" data-action="${v.isMinting ? 'stop' : 'start'}" ${actionBtnDisabled ? 'disabled' : ''} style="padding: 2px 8px; font-size: 12px; ${actionBtnDisabled ? 'opacity: 0.5;' : ''}">
								${actionBtnText}
							</button>
						</td>
					</tr>
				`;
			}
			
			tbody.innerHTML = html;
			
			// Перепривязываем обработчики
			tbody.querySelectorAll('input[type="checkbox"]:not(.snob-auto-start)').forEach(cb => {
				cb.addEventListener('change', (e) => {
					const id = e.target.getAttribute('data-id');
					this.toggleVillage(id);
				});
			});
			
			tbody.querySelectorAll('.snob-auto-start').forEach(cb => {
				cb.addEventListener('change', (e) => {
					const id = e.target.getAttribute('data-id');
					const village = this.villages.find(v => v.id == id);
					if (village) {
						village.autoStart = e.target.checked;
						this.saveAutoStartState();
						console.log(`[SnobMinter] Auto-start for ${village.name}: ${village.autoStart}`);
					}
				});
			});
			
			tbody.querySelectorAll('.snob-action-btn').forEach(btn => {
				btn.addEventListener('click', async (e) => {
					const id = e.target.getAttribute('data-id');
					const action = e.target.getAttribute('data-action');
					console.log(`[SnobMinter] Button clicked: ${action} for village ${id}`);
					if (action === 'start') {
						await this.startSingleMinting(id);
					} else if (action === 'stop') {
						await this.stopSingleMinting(id);
					}
				});
			});
			
			this.updateUI();
			
			const total = this.villages.filter(v => !v.isMinting).length;
			const active = this.villages.filter(v => v.isMinting).length;
			const foundMsg = this.t('villagesFound').replace('{count}', this.villages.length);
			const counter = document.getElementById('snob-counter');
			if (counter) {
				counter.textContent = `${foundMsg} | Выбрано: ${this.selectedVillages.size} / ${total} | Активных: ${active}`;
			}
		},
        
        // Запуск чеканки для одной деревни
        startSingleMinting: async function(villageId) {
            if (this.isRunning) {
                UI.ErrorMessage('Операция уже выполняется!');
                return;
            }
            
            const village = this.villages.find(v => v.id == villageId);
            if (!village) return;
            
            if (village.isMinting) {
                UI.ErrorMessage('Чеканка уже активна!');
                return;
            }
            
            this.isRunning = true;
            this.updateUI();
            
            const progressDiv = document.getElementById('snob-progress');
            const progressText = document.getElementById('snob-progress-text');
            const progressBar = document.getElementById('snob-progress-bar');
            
            if (progressDiv) progressDiv.style.display = 'block';
            if (progressText) progressText.textContent = `${village.name} (${village.coord}) - запуск чеканки...`;
            if (progressBar) progressBar.value = 50;
            
            village.status = 'minting';
            this.updateVillageStatus(village.id, 'minting');
            
            const result = await this.startMinting(villageId);
            
            village.status = 'success';
            this.updateVillageStatus(village.id, 'success', 'Запущено');
            UI.SuccessMessage('✅ Чеканка запущена');
            
            this.isRunning = false;
            
            if (progressDiv) {
                setTimeout(() => {
                    progressDiv.style.display = 'none';
                }, 2000);
            }
            
            console.log('[SnobMinter] Updating status after start operation...');
            await this.sleep(3000);
            await this.loadAllMintingStatuses(true);
            this.updateUI();
        },
        
        // Загрузка страницы особняка и клик по кнопке
        clickSnobButton: function(villageId, action) {
            return new Promise((resolve) => {
                const baseUrl = this.getBaseUrl();
                const url = `${baseUrl}/game.php?screen=snob&village=${villageId}`;
                
                console.log(`[SnobMinter] Loading snob page for village ${villageId}...`);
                
                const iframe = document.createElement('iframe');
                iframe.style.display = 'none';
                iframe.src = url;
                document.body.appendChild(iframe);
                
                let buttonFound = false;
                
                iframe.onload = function() {
                    try {
                        const doc = iframe.contentDocument || iframe.contentWindow.document;
                        
                        let button = null;
                        if (action === 'start') {
                            const forms = doc.querySelectorAll('form[action*="start_auto_minting_session"]');
                            for (const form of forms) {
                                const btn = form.querySelector('button');
                                if (btn && (btn.textContent.includes('Активировать') || btn.textContent.includes('Activate'))) {
                                    button = btn;
                                    break;
                                }
                            }
                        } else if (action === 'cancel') {
                            const forms = doc.querySelectorAll('form[action*="cancel_auto_minting_session"]');
                            for (const form of forms) {
                                const btn = form.querySelector('button');
                                if (btn && (btn.textContent.includes('Отменить') || btn.textContent.includes('Cancel'))) {
                                    button = btn;
                                    break;
                                }
                            }
                        }
                        
                        if (button) {
                            buttonFound = true;
                            console.log(`[SnobMinter] Found button, clicking...`);
                            button.click();
                            
                            setTimeout(() => {
                                if (iframe.parentNode) {
                                    iframe.parentNode.removeChild(iframe);
                                }
                                resolve({ success: true });
                            }, 2000);
                        } else {
                            console.log(`[SnobMinter] Button not found for action: ${action}`);
                            if (iframe.parentNode) {
                                iframe.parentNode.removeChild(iframe);
                            }
                            resolve({ success: true });
                        }
                    } catch(e) {
                        console.error('[SnobMinter] Error in iframe:', e);
                        if (iframe.parentNode) {
                            iframe.parentNode.removeChild(iframe);
                        }
                        resolve({ success: true });
                    }
                };
                
                iframe.onerror = function() {
                    console.error('[SnobMinter] Failed to load iframe');
                    if (iframe.parentNode) {
                        iframe.parentNode.removeChild(iframe);
                    }
                    resolve({ success: true });
                };
                
                setTimeout(() => {
                    if (iframe.parentNode) {
                        iframe.parentNode.removeChild(iframe);
                    }
                    resolve({ success: true });
                }, 15000);
            });
        },
        
        // Запуск чеканки для одной деревни
        startMinting: function(villageId) {
            return this.clickSnobButton(villageId, 'start');
        },
        
        // Отмена чеканки для одной деревни
        cancelMinting: function(villageId) {
            return this.clickSnobButton(villageId, 'cancel');
        },
        
        // Показать результаты в UI
        showResults: function(results) {
            this.lastResults = results;
            const resultsDiv = document.getElementById('snob-results');
            if (!resultsDiv) return;
            
            const { successCount, errorCount, alreadyCount, total, action } = results;
            
            let html = `
                <div style="padding: 10px; background: ${successCount === total ? '#d4edda' : '#f8d7da'}; border-radius: 4px; margin-top: 10px;">
                    <strong>${action === 'start' ? this.t('completed') : this.t('stopCompleted')}</strong><br>
                    ${this.t('successCount').replace('{count}', successCount)}<br>
                    ${this.t('errorCount').replace('{count}', errorCount)}<br>
                    ${this.t('alreadyCount').replace('{count}', alreadyCount)}<br>
                    ${this.t('total').replace('{count}', total)}
                </div>
            `;
            
            resultsDiv.innerHTML = html;
            resultsDiv.style.display = 'block';
            
            setTimeout(() => {
                resultsDiv.style.display = 'none';
            }, 10000);
        },
        
        // Запуск чеканки для всех выбранных деревень
        startMintingAll: async function() {
            if (this.isRunning) {
                UI.ErrorMessage('Операция уже выполняется!');
                return;
            }
            
            const selectedIds = Array.from(this.selectedVillages);
            if (selectedIds.length === 0) {
                UI.ErrorMessage('Выберите хотя бы одну деревню!');
                return;
            }
            
            this.isRunning = true;
            this.mintResults = [];
            this.updateUI();
            
            const progressDiv = document.getElementById('snob-progress');
            const progressText = document.getElementById('snob-progress-text');
            const progressBar = document.getElementById('snob-progress-bar');
            
            if (progressDiv) progressDiv.style.display = 'block';
            
            let successCount = 0;
            let alreadyCount = 0;
            
            for (let i = 0; i < selectedIds.length; i++) {
                if (!this.isRunning) break;
                
                const villageId = selectedIds[i];
                const village = this.villages.find(v => v.id == villageId);
                if (!village) continue;
                
                if (village.isMinting) {
                    village.status = 'already';
                    alreadyCount++;
                    this.mintResults.push({ villageId, status: 'already', message: 'Уже чеканит' });
                    this.updateVillageStatus(villageId, 'already');
                    continue;
                }
                
                village.status = 'minting';
                this.updateVillageStatus(villageId, 'minting');
                
                if (progressText) {
                    progressText.textContent = `${i+1}/${selectedIds.length}: ${village.name} (${village.coord}) - запуск чеканки...`;
                }
                if (progressBar) {
                    progressBar.value = ((i + 1) / selectedIds.length) * 100;
                }
                
                await this.startMinting(villageId);
                
                village.status = 'success';
                successCount++;
                this.mintResults.push({ villageId, status: 'success', message: 'Успешно' });
                this.updateVillageStatus(villageId, 'success');
                
                if (progressText) {
                    progressText.textContent = `${i+1}/${selectedIds.length}: ${village.name} (${village.coord}) - ✅`;
                }
                
                if (i < selectedIds.length - 1) {
                    await this.sleep(2000);
                }
            }
            
            this.isRunning = false;
            
            if (progressDiv) {
                setTimeout(() => {
                    progressDiv.style.display = 'none';
                }, 3000);
            }
            
            this.showResults({
                successCount,
                errorCount: 0,
                alreadyCount,
                total: selectedIds.length,
                action: 'start'
            });
            
            console.log('[SnobMinter] Waiting 3 seconds before updating statuses...');
            await this.sleep(3000);
            
            console.log('[SnobMinter] Updating statuses after start operations...');
            await this.loadAllMintingStatuses(true);
            
            this.updateUI();
            UI.SuccessMessage(`✅ Чеканка запущена в ${successCount} деревнях`);
        },
        
        // Остановка чеканки для всех активных деревень
        stopAllMinting: async function() {
            if (this.isRunning) {
                UI.ErrorMessage('Операция уже выполняется!');
                return;
            }
            
            const activeVillages = this.villages.filter(v => v.isMinting);
            if (activeVillages.length === 0) {
                UI.ErrorMessage('Нет активных чеканок для остановки!');
                return;
            }
            
            if (!confirm(`Остановить чеканку в ${activeVillages.length} деревнях?`)) {
                return;
            }
            
            this.isRunning = true;
            this.updateUI();
            
            const progressDiv = document.getElementById('snob-progress');
            const progressText = document.getElementById('snob-progress-text');
            const progressBar = document.getElementById('snob-progress-bar');
            
            if (progressDiv) progressDiv.style.display = 'block';
            
            let successCount = 0;
            
            for (let i = 0; i < activeVillages.length; i++) {
                if (!this.isRunning) break;
                
                const village = activeVillages[i];
                village.status = 'minting';
                this.updateVillageStatus(village.id, 'minting');
                
                if (progressText) {
                    progressText.textContent = `${i+1}/${activeVillages.length}: ${village.name} (${village.coord}) - остановка чеканки...`;
                }
                if (progressBar) {
                    progressBar.value = ((i + 1) / activeVillages.length) * 100;
                }
                
                await this.cancelMinting(village.id);
                
                successCount++;
                village.status = 'success';
                this.updateVillageStatus(village.id, 'success', 'Остановлено');
                
                if (progressText) {
                    progressText.textContent = `${i+1}/${activeVillages.length}: ${village.name} (${village.coord}) - ✅`;
                }
                
                if (i < activeVillages.length - 1) {
                    await this.sleep(2000);
                }
            }
            
            this.isRunning = false;
            
            if (progressDiv) {
                setTimeout(() => {
                    progressDiv.style.display = 'none';
                }, 3000);
            }
            
            this.showResults({
                successCount,
                errorCount: 0,
                alreadyCount: 0,
                total: activeVillages.length,
                action: 'stop'
            });
            
            console.log('[SnobMinter] Waiting 3 seconds before updating statuses...');
            await this.sleep(3000);
            
            console.log('[SnobMinter] Updating statuses after stop operations...');
            await this.loadAllMintingStatuses(true);
            
            this.updateUI();
            UI.SuccessMessage(`✅ Чеканка остановлена в ${successCount} деревнях`);
        },
        
        // Остановка чеканки для одной деревни
        stopSingleMinting: async function(villageId) {
            if (this.isRunning) {
                UI.ErrorMessage('Операция уже выполняется!');
                return;
            }
            
            const village = this.villages.find(v => v.id == villageId);
            if (!village) return;
            
            if (!confirm(this.t('cancelConfirm').replace('{village}', `${village.name} (${village.coord})`))) {
                return;
            }
            
            this.isRunning = true;
            
            const progressDiv = document.getElementById('snob-progress');
            const progressText = document.getElementById('snob-progress-text');
            const progressBar = document.getElementById('snob-progress-bar');
            
            if (progressDiv) progressDiv.style.display = 'block';
            if (progressText) progressText.textContent = `${village.name} (${village.coord}) - остановка чеканки...`;
            if (progressBar) progressBar.value = 50;
            
            village.status = 'minting';
            this.updateVillageStatus(village.id, 'minting');
            
            await this.cancelMinting(villageId);
            
            village.status = 'success';
            this.updateVillageStatus(village.id, 'success', 'Остановлено');
            UI.SuccessMessage(this.t('cancelSuccess'));
            
            this.isRunning = false;
            
            if (progressDiv) {
                setTimeout(() => {
                    progressDiv.style.display = 'none';
                }, 2000);
            }
            
            console.log('[SnobMinter] Waiting 3 seconds before updating status...');
            await this.sleep(3000);
            
            console.log('[SnobMinter] Updating status after stop operation...');
            await this.loadAllMintingStatuses(true);
            this.updateUI();
        },
        
        updateVillageStatus: function(villageId, status, extraText = '') {
            const row = document.querySelector(`tr[data-id="${villageId}"]`);
            if (!row) return;
            
            const statusCell = row.querySelector('.village-status');
            if (!statusCell) return;
            
            const statusMap = {
                'waiting': { text: '⏳ Ожидание', color: '#6c757d' },
                'minting': { text: '🔄 Выполняется...', color: '#ff9800' },
                'success': { text: `✅ ${extraText || 'Успешно'}`, color: '#28a745' },
                'error': { text: `❌ ${extraText || 'Ошибка'}`, color: '#dc3545' },
                'already': { text: '⏳ Уже чеканит', color: '#17a2b8' }
            };
            
            const statusInfo = statusMap[status] || statusMap['waiting'];
            statusCell.innerHTML = `<span style="color: ${statusInfo.color};">${statusInfo.text}</span>`;
        },
        
        toggleVillage: function(villageId) {
            if (this.selectedVillages.has(villageId)) {
                this.selectedVillages.delete(villageId);
            } else {
                this.selectedVillages.add(villageId);
            }
            this.updateUI();
        },
        
        selectAll: function() {
            for (const v of this.villages) {
                if (!v.isMinting) {
                    this.selectedVillages.add(v.id);
                }
            }
            this.updateUI();
        },
        
        deselectAll: function() {
            this.selectedVillages.clear();
            this.updateUI();
        },
        
        updateUI: function() {
            for (const v of this.villages) {
                const checkbox = document.querySelector(`input[data-id="${v.id}"]:not(.snob-auto-start)`);
                if (checkbox) {
                    checkbox.checked = this.selectedVillages.has(v.id);
                    checkbox.disabled = this.isRunning || v.isMinting;
                }
            }
            
            const startBtn = document.getElementById('snob-start-btn');
            const stopAllBtn = document.getElementById('snob-stop-all-btn');
            const selectAllBtn = document.getElementById('snob-select-all');
            const deselectAllBtn = document.getElementById('snob-deselect-all');
            
            const hasActive = this.villages.some(v => v.isMinting);
            
            if (startBtn) {
                startBtn.disabled = this.isRunning || this.selectedVillages.size === 0;
                startBtn.textContent = this.isRunning ? '⏳ Выполняется...' : this.t('startMinting');
            }
            if (stopAllBtn) {
                stopAllBtn.disabled = this.isRunning || !hasActive;
                stopAllBtn.textContent = this.isRunning ? '⏳ Выполняется...' : this.t('stopAll');
            }
            if (selectAllBtn) {
                selectAllBtn.disabled = this.isRunning;
            }
            if (deselectAllBtn) {
                deselectAllBtn.disabled = this.isRunning;
            }
            
            const counter = document.getElementById('snob-counter');
            if (counter) {
                const total = this.villages.filter(v => !v.isMinting).length;
                const active = this.villages.filter(v => v.isMinting).length;
                counter.textContent = `${this.selectedVillages.size} / ${total} выбрано | Активных: ${active}`;
            }
            
            this.updateNobleInfoUI();
            this.updateLastUpdateTime();
        },
        
        showHelp: function() {
            const helpDiv = document.getElementById('snob-help-panel');
            if (!helpDiv) return;
            
            const isVisible = helpDiv.style.display !== 'none';
            helpDiv.style.display = isVisible ? 'none' : 'block';
            
            if (!isVisible) {
                helpDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        },
        
        startAutoUpdate: function() {
            if (this.autoUpdateInterval) {
                clearTimeout(this.autoUpdateInterval);
            }
            
            const minInterval = 5 * 60 * 1000;
            const maxInterval = 15 * 60 * 1000;
            
            const scheduleNextUpdate = () => {
                const randomInterval = Math.floor(Math.random() * (maxInterval - minInterval + 1)) + minInterval;
                console.log(`[SnobMinter] Next auto-update in ${Math.round(randomInterval / 60000)} minutes`);
                
                this.autoUpdateInterval = setTimeout(async () => {
                    console.log('[SnobMinter] Auto-updating statuses...');
                    await this.loadAllMintingStatuses(true);
                    scheduleNextUpdate();
                }, randomInterval);
            };
            
            scheduleNextUpdate();
        },
        
        createGUI: function() {
            const contentValue = document.getElementById('content_value');
            if (!contentValue) return;
            
            const existing = document.getElementById('tw-snob-minter');
            if (existing) existing.remove();
            
            const div = document.createElement('div');
            div.id = 'tw-snob-minter';
            div.style.cssText = 'min-width: 100%; max-width: 100%; margin: 10px auto; padding: 10px; box-sizing: border-box; overflow-x: auto; background: #f8f9fa; border-radius: 8px; border: 1px solid #dee2e6;';
            
            div.innerHTML = `
                <div style="font-weight: bold; text-align: center; font-size: 18px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                    <span>🏰 ${this.t('title')}</span>
                    <span id="snob-last-update" style="font-size: 11px; color: #999; font-weight: normal;"></span>
                    <div>
                        <button id="snob-help-btn" class="btn" style="font-size: 14px;">❓ ${this.t('help')}</button>
                    </div>
                </div>
                
                <div id="snob-help-panel" style="display: none; margin-bottom: 15px; padding: 15px; background: white; border: 2px solid #6c757d; border-radius: 8px; position: relative;">
                    <button id="snob-help-close" style="position: absolute; top: 5px; right: 10px; font-size: 20px; background: none; border: none; cursor: pointer; color: #dc3545;">✕</button>
                    <h3 style="margin-top: 0; color: #6c757d;">📖 ${this.t('helpTitle')}</h3>
                    <div style="font-size: 13px; line-height: 1.8; max-height: 400px; overflow-y: auto; padding: 5px;">
                        ${this.t('helpText')}
                    </div>
                </div>
                
                <div id="snob-noble-info" style="margin-bottom: 15px;"></div>
                
                <div id="snob-results" style="display: none; margin-bottom: 15px;"></div>
                
                <div style="margin-bottom: 15px; display: flex; gap: 10px; flex-wrap: wrap; align-items: center;">
                    <button id="snob-refresh-btn" class="btn">🔄 Обновить список</button>
                    <button id="snob-select-all" class="btn">✅ ${this.t('selectAll')}</button>
                    <button id="snob-deselect-all" class="btn">❌ ${this.t('deselectAll')}</button>
                    <button id="snob-start-btn" class="btn btn-confirm-yes" disabled>▶️ ${this.t('startMinting')}</button>
                    <button id="snob-stop-all-btn" class="btn btn-confirm-no" disabled>⏹️ ${this.t('stopAll')}</button>
                    <span id="snob-counter" style="font-size: 12px; color: #666;"></span>
                </div>
                
                <div id="snob-progress" style="display: none; margin-bottom: 15px; padding: 10px; background: #f0fff0; border: 1px solid #4CAF50; border-radius: 4px;">
                    <div>🔄 ${this.t('progress')}: <span id="snob-progress-text"></span></div>
                    <progress id="snob-progress-bar" value="0" max="100" style="width: 100%; margin-top: 5px;"></progress>
                </div>
                
                <div style="max-height: 500px; overflow-y: auto; background: white; border-radius: 4px;">
                    <table class="vis" style="width: 100%; font-size: 12px; min-width: 750px;">
                        <thead>
                            <tr style="background: #6c757d; color: white;">
                                <th style="width: 40px; padding: 8px;">
                                    <input type="checkbox" id="snob-header-checkbox">
                                </th>
                                <th style="padding: 8px;">🏠 ${this.t('village')}</th>
                                <th style="padding: 8px;">📍 ${this.t('coordinates')}</th>
                                <th style="padding: 8px; min-width: 100px;">📊 ${this.t('status')}</th>
                                <th style="padding: 8px; min-width: 80px;">💰 ${this.t('coinsMinted')}</th>
                                <th style="padding: 8px; min-width: 120px;">⏰ ${this.t('completion')}</th>
                                <th style="padding: 8px; min-width: 80px;">🔄 ${this.t('autoStart')}</th>
                                <th style="padding: 8px; min-width: 60px;">⚙️ ${this.t('stop')}</th>
                            </tr>
                        </thead>
                        <tbody id="snob-tbody">
                            <tr><td colspan="8" style="text-align: center; padding: 20px;">${this.t('loading')}</td></tr>
                        </tbody>
                    </table>
                </div>
            `;
            
            contentValue.insertBefore(div, contentValue.firstChild);
            
            document.getElementById('snob-refresh-btn')?.addEventListener('click', () => this.refreshVillages());
            document.getElementById('snob-select-all')?.addEventListener('click', () => this.selectAll());
            document.getElementById('snob-deselect-all')?.addEventListener('click', () => this.deselectAll());
            document.getElementById('snob-start-btn')?.addEventListener('click', () => this.startMintingAll());
            document.getElementById('snob-stop-all-btn')?.addEventListener('click', () => this.stopAllMinting());
            document.getElementById('snob-help-btn')?.addEventListener('click', () => this.showHelp());
            document.getElementById('snob-help-close')?.addEventListener('click', () => {
                document.getElementById('snob-help-panel').style.display = 'none';
            });
            
            document.getElementById('snob-header-checkbox')?.addEventListener('change', (e) => {
                const checked = e.target.checked;
                for (const v of this.villages) {
                    if (!v.isMinting) {
                        if (checked) {
                            this.selectedVillages.add(v.id);
                        } else {
                            this.selectedVillages.delete(v.id);
                        }
                    }
                }
                this.updateUI();
            });
            
            this.refreshVillages();
        },
        
        refreshVillages: async function() {
            const tbody = document.getElementById('snob-tbody');
            if (!tbody) return;
            
            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 20px;">${this.t('loading')}</td></tr>`;
            
            try {
                await this.fetchVillagesWithSnob();
                this.selectedVillages.clear();
                
                if (this.villages.length === 0) {
                    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 20px;">${this.t('noVillages')}</td></tr>`;
                    return;
                }
                
                await this.loadAllMintingStatuses();
                await this.refreshTable();
                
                this.startAutoUpdate();
                
                UI.SuccessMessage(`Найдено ${this.villages.length} деревень с особняком`);
                
            } catch(error) {
                console.error('Ошибка загрузки:', error);
                tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 20px; color: #dc3545;">❌ Ошибка загрузки: ${error.message}</td></tr>`;
                UI.ErrorMessage('Ошибка загрузки списка деревень');
            }
        },
        
        init: function() {
            this.createGUI();
        }
    };
    
    SnobMinter.init();
})();
