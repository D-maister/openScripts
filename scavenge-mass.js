// ПОЛНЫЙ СКРИПТ ДЛЯ СБОРОВ С ИСТОРИЕЙ, АВТООТПРАВКОЙ И ПЕРЕРАСПРЕДЕЛЕНИЕМ
// Версия 10.6 - с корректным парсингом ресурсов (числа с точками)
(function() {
    'use strict';
    
    // Коэффициенты опций (15:6:3:2)
    const OPTION_RATIOS = { 1: 15, 2: 6, 3: 3, 4: 2 };
    const OPTION_NAMES = { 1: 'Ленивые', 2: 'Скромные', 3: 'Искусные', 4: 'Великие' };
    
    // Типы войск для сборов (БЕЗ ПАЛАДИНА)
    let TROOP_TYPES = [];
    let TROOP_OVERVIEW_INDEX = {};
    let hasArchers = false;
    
    // Минимальное количество войск для отправки
    const MIN_TROOPS_TO_SEND = 10;
    
    // Задержки
    const WAIT_AFTER_INPUT = 1500;
    const WAIT_BETWEEN_OPTIONS = 500;
    const WAIT_AFTER_SEND = 2000;
    const WAIT_AFTER_REFRESH = 2000;
    const MAX_RETRIES = 3;
    
    // Глобальное состояние
    let fineTuningEnabled = false;
    let autoSendEnabled = false;
    let autoSendInterval = null;
    let isSendingInProgress = false;
    let isRefreshingTroops = false;
    
    // История отправок
    let sendHistory = [];
    const MAX_HISTORY_ENTRIES = 1000;
    
    // ==================== ПАРСИНГ РЕСУРСОВ ====================
    
    function parseResourceValue(text) {
        if (!text || text === '-') return 0;
        
        // Удаляем все пробелы и HTML-сущности
        let clean = text.replace(/\s/g, '').replace(/&nbsp;/g, '');
        
        // Удаляем все точки и запятые (они используются как разделители тысяч)
        // Например: "1.999.980" → "1999980"
        clean = clean.replace(/[.,]/g, '');
        
        // Парсим число
        const num = parseInt(clean);
        return isNaN(num) ? 0 : num;
    }
    
    // ==================== РАБОТА С ИСТОРИЕЙ ====================
    
    function getHistoryKey() {
        const server = getCurrentServer();
        return 'scavenge_history_' + server;
    }
    
    function loadHistory() {
        try {
            const data = localStorage.getItem(getHistoryKey());
            if (data) {
                sendHistory = JSON.parse(data);
                if (!Array.isArray(sendHistory)) sendHistory = [];
                return sendHistory;
            }
        } catch(e) {
            console.error('Ошибка загрузки истории:', e);
        }
        sendHistory = [];
        return sendHistory;
    }
    
    function saveHistory() {
        try {
            if (sendHistory.length > MAX_HISTORY_ENTRIES) {
                sendHistory = sendHistory.slice(-MAX_HISTORY_ENTRIES);
            }
            localStorage.setItem(getHistoryKey(), JSON.stringify(sendHistory));
        } catch(e) {
            console.error('Ошибка сохранения истории:', e);
        }
    }
    
    function addHistoryEntry(villageName, optionId, troops, resources, duration, totalCapacity) {
        const entry = {
            timestamp: new Date().toISOString(),
            date: new Date().toLocaleDateString('ru-RU'),
            time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            village: villageName,
            optionId: optionId,
            optionName: OPTION_NAMES[optionId],
            troops: { ...troops },
            resources: { ...resources },
            duration: duration,
            totalCapacity: totalCapacity,
            totalResources: resources.wood + resources.stone + resources.iron
        };
        sendHistory.push(entry);
        saveHistory();
        updateHistoryUI();
    }
    
    function clearHistory() {
        if (confirm('Удалить всю историю отправок?')) {
            sendHistory = [];
            saveHistory();
            updateHistoryUI();
            showNotification('История очищена');
        }
    }
    
    // ==================== УВЕДОМЛЕНИЯ ====================
    
    function requestNotificationPermission() {
        if (!('Notification' in window)) {
            console.log('Уведомления не поддерживаются');
            return false;
        }
        
        if (Notification.permission === 'granted') {
            return true;
        }
        
        if (Notification.permission === 'denied') {
            console.log('Уведомления запрещены');
            return false;
        }
        
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                console.log('Разрешение на уведомления получено');
                showNotification('Уведомления включены');
            } else {
                console.log('Разрешение на уведомления отклонено');
            }
        });
        return false;
    }
    
    function showNotification(message) {
        if (!('Notification' in window) || Notification.permission !== 'granted') {
            return;
        }
        
        try {
            const notification = new Notification('Tribal Wars - Сборы', {
                body: message,
                tag: 'scavenge-notification'
            });
            
            setTimeout(() => notification.close(), 10000);
        } catch(e) {
            console.error('Ошибка уведомления:', e);
        }
    }
    
    function notifyScavengeSent(villageName, time) {
        const message = 'Отправка на сборы для "' + villageName + '" выполнена в ' + time;
        showNotification(message);
        console.log('[УВЕДОМЛЕНИЕ]', message);
    }
    
    // ==================== ОПРЕДЕЛЕНИЕ МИРА ====================
    
    function detectAndInitWorld() {
        const archerInput = document.querySelector('input[name="archer"]');
        const marcherInput = document.querySelector('input[name="marcher"]');
        
        if (archerInput && marcherInput) {
            hasArchers = true;
            console.log('[МИР] С ЛУЧНИКАМИ');
            
            TROOP_TYPES = [
                { key: 'spear', name: 'Копейщик', icon: '🗡️', carry: 25, overviewIndex: 0 },
                { key: 'sword', name: 'Мечник', icon: '⚔️', carry: 15, overviewIndex: 1 },
                { key: 'axe', name: 'Топорник', icon: '🪓', carry: 10, overviewIndex: 2 },
                { key: 'archer', name: 'Лучник', icon: '🏹', carry: 10, overviewIndex: 3 },
                { key: 'light', name: 'Лёгкий кавалерист', icon: '🐎', carry: 80, overviewIndex: 5 },
                { key: 'marcher', name: 'Конный лучник', icon: '🏇', carry: 50, overviewIndex: 6 },
                { key: 'heavy', name: 'Тяжёлый кавалерист', icon: '🛡️', carry: 50, overviewIndex: 7 }
            ];
        } else {
            hasArchers = false;
            console.log('[МИР] БЕЗ ЛУЧНИКОВ');
            
            TROOP_TYPES = [
                { key: 'spear', name: 'Копейщик', icon: '🗡️', carry: 25, overviewIndex: 0 },
                { key: 'sword', name: 'Мечник', icon: '⚔️', carry: 15, overviewIndex: 1 },
                { key: 'axe', name: 'Топорник', icon: '🪓', carry: 10, overviewIndex: 2 },
                { key: 'light', name: 'Лёгкий кавалерист', icon: '🐎', carry: 80, overviewIndex: 4 },
                { key: 'heavy', name: 'Тяжёлый кавалерист', icon: '🛡️', carry: 50, overviewIndex: 5 }
            ];
        }
        
        for (const troop of TROOP_TYPES) {
            TROOP_OVERVIEW_INDEX[troop.key] = troop.overviewIndex;
        }
        
        console.log('[МИР] Типы войск:', TROOP_TYPES.map(t => t.key).join(', '));
    }
    
    // ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
    
    function getCurrentServer() {
        const match = window.location.hostname.match(/([a-z]+[0-9]+)\./);
        return match ? match[1] : 'default';
    }
    
    function getCurrentVillageId() {
        const topdisplay = document.getElementById('topdisplay');
        if (topdisplay) {
            const link = topdisplay.querySelector('.bg a');
            if (link && link.href) {
                const match = link.href.match(/village=(\d+)/);
                if (match) return match[1];
            }
        }
        const urlMatch = window.location.href.match(/village=(\d+)/);
        return urlMatch ? urlMatch[1] : null;
    }
    
    function getVillageName(villageId) {
        const row = document.querySelector('#scavenge_village_' + villageId);
        if (row) {
            const link = row.querySelector('td:first-child a');
            if (link) return link.textContent.trim();
        }
        return 'Деревня ' + villageId;
    }
    
    function saveFineTuningState(enabled) {
        const server = getCurrentServer();
        localStorage.setItem('scavenge_fine_tuning_' + server, enabled ? 'true' : 'false');
    }
    
    function loadFineTuningState() {
        const server = getCurrentServer();
        const saved = localStorage.getItem('scavenge_fine_tuning_' + server);
        return saved === 'true';
    }
    
    function saveAutoSendState(enabled) {
        const server = getCurrentServer();
        localStorage.setItem('scavenge_autosend_' + server, enabled ? 'true' : 'false');
    }
    
    function loadAutoSendState() {
        const server = getCurrentServer();
        const saved = localStorage.getItem('scavenge_autosend_' + server);
        return saved === 'true';
    }
    
    function saveTroopLimit(villageId, troopKey, limitValue) {
        const server = getCurrentServer();
        localStorage.setItem('scavenge_limit_' + server + '_' + villageId + '_' + troopKey, limitValue);
    }
    
    function loadTroopLimit(villageId, troopKey) {
        const server = getCurrentServer();
        const key = 'scavenge_limit_' + server + '_' + villageId + '_' + troopKey;
        const saved = localStorage.getItem(key);
        return saved !== null ? saved : '';
    }
    
    function saveCapacityLimit(villageId, limitValue) {
        const server = getCurrentServer();
        localStorage.setItem('scavenge_capacity_limit_' + server + '_' + villageId, limitValue);
    }
    
    function loadCapacityLimit(villageId) {
        const server = getCurrentServer();
        const key = 'scavenge_capacity_limit_' + server + '_' + villageId;
        const saved = localStorage.getItem(key);
        return saved !== null ? saved : '';
    }
    
    function saveTroopSelection(villageId, troopKey, isSelected) {
        const server = getCurrentServer();
        localStorage.setItem('scavenge_troop_' + server + '_' + villageId + '_' + troopKey, isSelected ? 'true' : 'false');
    }
    
    function loadTroopSelection(villageId, troopKey) {
        const server = getCurrentServer();
        const key = 'scavenge_troop_' + server + '_' + villageId + '_' + troopKey;
        const saved = localStorage.getItem(key);
        return saved !== null ? saved === 'true' : true;
    }
    
    function savePercent(villageId, percent) {
        const server = getCurrentServer();
        localStorage.setItem('scavenge_percent_' + server + '_' + villageId, percent);
    }
    
    function loadPercent(villageId) {
        const server = getCurrentServer();
        const saved = localStorage.getItem('scavenge_percent_' + server + '_' + villageId);
        return saved !== null ? parseInt(saved) : 100;
    }
    
    function saveSelectedModes(villageId, selectedModes) {
        const server = getCurrentServer();
        localStorage.setItem('scavenge_modes_' + server + '_' + villageId, JSON.stringify(selectedModes));
    }
    
    function loadSelectedModes(villageId) {
        const server = getCurrentServer();
        const key = 'scavenge_modes_' + server + '_' + villageId;
        const saved = localStorage.getItem(key);
        if (saved) {
            try { return JSON.parse(saved); }
            catch(e) { return [1, 2, 3, 4]; }
        }
        return [1, 2, 3, 4];
    }
    
    function parseLimitValue(limitStr, totalTroops) {
        if (!limitStr || limitStr.trim() === '') return null;
        limitStr = limitStr.trim();
        if (limitStr.endsWith('%')) {
            const percent = parseFloat(limitStr.slice(0, -1));
            if (!isNaN(percent)) return Math.floor(totalTroops * percent / 100);
        } else {
            const number = parseInt(limitStr);
            if (!isNaN(number)) return number;
        }
        return null;
    }
    
    function applyLimits(troopsToSend, limits, totalTroops) {
        const result = { ...troopsToSend };
        for (const troopKey in result) {
            const limitStr = limits[troopKey];
            if (limitStr && limitStr.trim() !== '') {
                const limitValue = parseLimitValue(limitStr, totalTroops[troopKey]);
                if (limitValue !== null && result[troopKey] > limitValue) {
                    result[troopKey] = limitValue;
                }
            }
        }
        return result;
    }
    
    function applyCapacityLimit(troopsToSend, capacityLimit) {
        if (!capacityLimit || capacityLimit.trim() === '') return troopsToSend;
        
        const limit = parseInt(capacityLimit);
        if (isNaN(limit) || limit <= 0) return troopsToSend;
        
        const sortedTroops = [...TROOP_TYPES].sort((a, b) => b.carry - a.carry);
        const result = { ...troopsToSend };
        
        let currentCapacity = 0;
        for (const troop of sortedTroops) {
            currentCapacity += (result[troop.key] || 0) * troop.carry;
        }
        
        if (currentCapacity <= limit) return result;
        
        const ascendingTroops = [...sortedTroops].reverse();
        
        for (const troop of ascendingTroops) {
            if (currentCapacity <= limit) break;
            
            const count = result[troop.key] || 0;
            if (count === 0) continue;
            
            const maxRemove = Math.min(count, Math.ceil((currentCapacity - limit) / troop.carry));
            const remove = Math.min(maxRemove, count);
            
            if (remove > 0) {
                result[troop.key] = count - remove;
                currentCapacity -= remove * troop.carry;
            }
        }
        
        if (currentCapacity > limit) {
            for (const troop of sortedTroops) {
                if (currentCapacity <= limit) break;
                
                const count = result[troop.key] || 0;
                if (count === 0) continue;
                
                const remove = Math.min(count, Math.ceil((currentCapacity - limit) / troop.carry));
                if (remove > 0) {
                    result[troop.key] = count - remove;
                    currentCapacity -= remove * troop.carry;
                }
            }
        }
        
        return result;
    }
    
    function getTroopLimits(villageId, totalTroops) {
        const limits = {};
        for (const troop of TROOP_TYPES) {
            limits[troop.key] = loadTroopLimit(villageId, troop.key);
        }
        return limits;
    }
    
    function getSelectedModes(villageId) {
        const selectedModes = [];
        for (let optId = 1; optId <= 4; optId++) {
            const checkbox = document.querySelector('.mode-' + optId + '[data-village-id="' + villageId + '"]');
            if (checkbox && checkbox.checked) {
                selectedModes.push(optId);
            }
        }
        return selectedModes.length > 0 ? selectedModes : [1, 2, 3, 4];
    }
    
    function setUnitInput(unitName, value) {
        const input = document.querySelector('input[name="' + unitName + '"]');
        if (input) {
            input.value = Math.floor(value);
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }
    
    function clearAllInputs() {
        for (const troop of TROOP_TYPES) {
            const input = document.querySelector('input[name="' + troop.key + '"]');
            if (input) {
                input.value = '';
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
    }
    
    function parseDuration(duration) {
        const parts = duration.split(':');
        if (parts.length === 3) {
            return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
        }
        return 0;
    }
    
    function applyMinTroops(troops) {
        const result = { ...troops };
        for (const key in result) {
            if (result[key] < MIN_TROOPS_TO_SEND) {
                result[key] = 0;
            }
        }
        return result;
    }
    
    function setOnlyThisOption(villageId, optionIdToSet) {
        for (let optId = 1; optId <= 4; optId++) {
            const checkbox = document.querySelector('#scavenge_village_' + villageId + ' td.option-' + optId + ' input[type="checkbox"]');
            if (checkbox && checkbox.checked) {
                checkbox.checked = false;
                checkbox.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
        
        const checkboxToSet = document.querySelector('#scavenge_village_' + villageId + ' td.option-' + optionIdToSet + ' input[type="checkbox"]');
        if (checkboxToSet && !checkboxToSet.disabled && !checkboxToSet.hasAttribute('disabled')) {
            checkboxToSet.checked = true;
            checkboxToSet.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        }
        return false;
    }
    
    function restoreAllDisabled() {
        document.querySelectorAll('.troop-checkbox, .mode-checkbox').forEach(cb => {
            cb.disabled = false;
        });
        document.querySelectorAll('.troops-percent-select').forEach(select => {
            select.disabled = false;
        });
        document.querySelectorAll('.auto-send-checkbox').forEach(cb => {
            cb.disabled = false;
        });
        document.querySelectorAll('.capacity-limit-input').forEach(input => {
            input.disabled = false;
        });
        document.querySelectorAll('.troop-limit-input').forEach(input => {
            input.disabled = false;
        });
    }
    
    function calculateTotalCapacity(troops) {
        let total = 0;
        for (const troop of TROOP_TYPES) {
            total += (troops[troop.key] || 0) * troop.carry;
        }
        return total;
    }
    
    // ==================== СТАТУСЫ ОПЦИЙ ====================
    
    function getOptionStatus(villageId, optionId) {
        const optionCell = document.querySelector('#scavenge_village_' + villageId + ' td.option-' + optionId);
        if (!optionCell) return 'unknown';
        
        if (optionCell.classList.contains('option-locked')) return 'locked';
        if (optionCell.classList.contains('option-unlocking')) return 'unlocking';
        if (optionCell.classList.contains('option-active')) return 'active';
        if (optionCell.classList.contains('option-inactive')) return 'inactive';
        
        return 'unknown';
    }
    
    function isOptionAvailableForSend(villageId, optionId, selectedModes) {
        if (!selectedModes.includes(optionId)) return false;
        
        const status = getOptionStatus(villageId, optionId);
        return status === 'inactive';
    }
    
    function getActiveOptionsForCalculation(villageId, selectedModes) {
        const activeOptions = [];
        for (const optId of selectedModes) {
            const status = getOptionStatus(villageId, optId);
            if (status === 'active' || status === 'inactive') {
                activeOptions.push(optId);
            }
        }
        return activeOptions;
    }
    
    function getAvailableOptionsForSend(villageId, selectedModes) {
        const availableOptions = [];
        for (const optId of selectedModes) {
            if (isOptionAvailableForSend(villageId, optId, selectedModes)) {
                availableOptions.push(optId);
            }
        }
        return availableOptions;
    }
    
    // ==================== РАСПРЕДЕЛЕНИЕ ВОЙСК ====================
    
    function calculateDistributionWithAvailability(totalToSend, villageId, selectedModes) {
        // 1. Определяем статус каждой опции
        const optionStatuses = {};
        for (const optId of selectedModes) {
            optionStatuses[optId] = getOptionStatus(villageId, optId);
        }
        
        // 2. Исключаем locked и unlocking из расчетов
        const activeOptions = selectedModes.filter(id => 
            optionStatuses[id] === 'active' || optionStatuses[id] === 'inactive'
        );
        
        // 3. Определяем доступные для отправки (inactive)
        const availableOptions = selectedModes.filter(id => 
            optionStatuses[id] === 'inactive'
        );
        
        if (availableOptions.length === 0) {
            return {
                finalDistribution: {},
                reservedTroops: {},
                remainingTroops: {},
                fullDistribution: {},
                optionStatuses: optionStatuses,
                activeOptions: activeOptions,
                availableOptions: availableOptions
            };
        }
        
        // 4. Рассчитываем распределение на ВСЕ активные опции (active + inactive)
        let totalRatioAll = 0;
        for (const optId of activeOptions) {
            totalRatioAll += OPTION_RATIOS[optId];
        }
        
        const fullDistribution = {};
        for (const optId of activeOptions) {
            fullDistribution[optId] = {};
            const fraction = OPTION_RATIOS[optId] / totalRatioAll;
            for (const troop of TROOP_TYPES) {
                fullDistribution[optId][troop.key] = Math.floor(totalToSend[troop.key] * fraction);
            }
        }
        
        // 5. Вычисляем войска для active опций (зарезервированы)
        const activeOptionIds = activeOptions.filter(id => optionStatuses[id] === 'active');
        const reservedTroops = {};
        for (const troop of TROOP_TYPES) {
            reservedTroops[troop.key] = 0;
            for (const optId of activeOptionIds) {
                reservedTroops[troop.key] += fullDistribution[optId][troop.key] || 0;
            }
        }
        
        // 6. Вычитаем зарезервированные войска
        const remainingTroops = {};
        for (const troop of TROOP_TYPES) {
            remainingTroops[troop.key] = totalToSend[troop.key] - reservedTroops[troop.key];
            if (remainingTroops[troop.key] < 0) remainingTroops[troop.key] = 0;
        }
        
        // 7. Перераспределяем на inactive опции
        let totalRatioAvailable = 0;
        for (const optId of availableOptions) {
            totalRatioAvailable += OPTION_RATIOS[optId];
        }
        
        const finalDistribution = {};
        for (const optId of availableOptions) {
            finalDistribution[optId] = {};
            const fraction = OPTION_RATIOS[optId] / totalRatioAvailable;
            for (const troop of TROOP_TYPES) {
                finalDistribution[optId][troop.key] = Math.floor(remainingTroops[troop.key] * fraction);
            }
        }
        
        // 8. Распределяем остатки от округления
        const distributedTroops = {};
        for (const troop of TROOP_TYPES) {
            distributedTroops[troop.key] = 0;
            for (const optId of availableOptions) {
                distributedTroops[troop.key] += finalDistribution[optId][troop.key] || 0;
            }
        }
        
        const leftovers = {};
        for (const troop of TROOP_TYPES) {
            leftovers[troop.key] = remainingTroops[troop.key] - distributedTroops[troop.key];
        }
        
        for (const troop of TROOP_TYPES) {
            let remaining = leftovers[troop.key];
            if (remaining <= 0) continue;
            
            const sortedOptions = [...availableOptions].sort((a, b) => OPTION_RATIOS[b] - OPTION_RATIOS[a]);
            for (const optId of sortedOptions) {
                if (remaining <= 0) break;
                finalDistribution[optId][troop.key] = (finalDistribution[optId][troop.key] || 0) + 1;
                remaining--;
            }
        }
        
        return {
            finalDistribution: finalDistribution,
            reservedTroops: reservedTroops,
            remainingTroops: remainingTroops,
            fullDistribution: fullDistribution,
            optionStatuses: optionStatuses,
            activeOptions: activeOptions,
            availableOptions: availableOptions
        };
    }
    
    // ==================== ПРОВЕРКА УСПЕШНОСТИ ОТПРАВКИ ====================
    
    function getScavengeState(villageId) {
        const row = document.querySelector('#scavenge_village_' + villageId);
        if (!row) return null;
        
        const state = {};
        const activeImages = row.querySelectorAll('.status-active');
        
        activeImages.forEach((img, index) => {
            const computedStyle = window.getComputedStyle(img);
            state[index] = computedStyle.display !== 'none';
        });
        
        return state;
    }
    
    function isScavengeStateChanged(beforeState, afterState) {
        if (!beforeState || !afterState) return false;
        
        const beforeKeys = Object.keys(beforeState);
        const afterKeys = Object.keys(afterState);
        
        if (beforeKeys.length !== afterKeys.length) return true;
        
        for (const key of beforeKeys) {
            if (beforeState[key] !== afterState[key]) {
                return true;
            }
        }
        
        return false;
    }
    
    function wasScavengeSent(villageId, beforeState) {
        let attempts = 0;
        const maxAttempts = 10;
        const delay = 500;
        
        return new Promise((resolve) => {
            const checkInterval = setInterval(() => {
                attempts++;
                const afterState = getScavengeState(villageId);
                
                if (isScavengeStateChanged(beforeState, afterState)) {
                    clearInterval(checkInterval);
                    resolve(true);
                    return;
                }
                
                const errorMsg = document.querySelector('.error_msg, .alert-error, .error');
                if (errorMsg) {
                    clearInterval(checkInterval);
                    resolve(false);
                    return;
                }
                
                if (attempts >= maxAttempts) {
                    clearInterval(checkInterval);
                    resolve(false);
                }
            }, delay);
        });
    }
    
    // ==================== ОБНОВЛЕНИЕ ВОЙСК ====================
    
    async function refreshTroopsData() {
        if (isRefreshingTroops) {
            console.log('[ОБНОВЛЕНИЕ] Уже выполняется');
            return false;
        }
        
        isRefreshingTroops = true;
        console.log('[ОБНОВЛЕНИЕ] Данных о войсках...');
        
        try {
            const refreshBtn = document.querySelector('.btn-refresh-troops');
            if (refreshBtn) {
                refreshBtn.textContent = 'Обновление...';
                refreshBtn.disabled = true;
            }
            
            const troopsData = await fetchTroopsData();
            
            if (!troopsData) {
                console.error('[ОБНОВЛЕНИЕ] Не удалось обновить данные');
                return false;
            }
            
            const updated = await updateTroopsTable(troopsData);
            
            if (updated) {
                console.log('[ОБНОВЛЕНИЕ] Данные обновлены');
                return true;
            } else {
                console.error('[ОБНОВЛЕНИЕ] Не удалось обновить таблицу');
                return false;
            }
            
        } catch (error) {
            console.error('[ОБНОВЛЕНИЕ] Ошибка:', error);
            return false;
        } finally {
            isRefreshingTroops = false;
            
            const refreshBtn = document.querySelector('.btn-refresh-troops');
            if (refreshBtn) {
                refreshBtn.textContent = 'Обновить войска';
                refreshBtn.disabled = false;
            }
        }
    }
    
    async function updateTroopsTable(troopsData) {
        const scavengeTable = document.querySelector('.mass-scavenge-table');
        if (!scavengeTable) return false;
        
        const villageRows = scavengeTable.querySelectorAll('tbody tr[id^="scavenge_village_"]');
        let updatedCount = 0;
        
        for (const row of villageRows) {
            const villageId = row.getAttribute('data-id');
            if (!villageId || !troopsData[villageId]) continue;
            
            const troops = troopsData[villageId];
            const troopCells = row.querySelectorAll('.troops-cell');
            
            TROOP_TYPES.forEach((troop, idx) => {
                if (idx < troopCells.length) {
                    const cell = troopCells[idx];
                    const count = troops[troop.key] || 0;
                    
                    const countSpan = cell.querySelector('.troop-count');
                    if (countSpan) {
                        countSpan.textContent = count.toLocaleString();
                        countSpan.title = count.toLocaleString() + ' ' + troop.name;
                    }
                    
                    const checkbox = cell.querySelector('.troop-' + troop.key);
                    if (checkbox) {
                        const isChecked = loadTroopSelection(villageId, troop.key);
                        checkbox.checked = isChecked;
                        
                        if (countSpan) {
                            if (!isChecked) {
                                countSpan.style.color = '#999';
                                countSpan.style.textDecoration = 'line-through';
                            } else {
                                countSpan.style.color = '';
                                countSpan.style.textDecoration = '';
                            }
                        }
                    }
                }
            });
            
            updatedCount++;
        }
        
        updateTotalRow();
        
        console.log('[ОБНОВЛЕНИЕ] Обновлено ' + updatedCount + ' деревень');
        return true;
    }
    
    function updateTotalRow() {
        const scavengeTable = document.querySelector('.mass-scavenge-table');
        if (!scavengeTable) return;
        
        const selectAllRow = Array.from(scavengeTable.querySelectorAll('tbody tr')).find(row => 
            row.querySelector('strong')?.textContent === 'Выбрать все'
        );
        if (!selectAllRow) return;
        
        const totals = {};
        for (const troop of TROOP_TYPES) {
            totals[troop.key] = 0;
        }
        
        const villageRows = scavengeTable.querySelectorAll('tbody tr[id^="scavenge_village_"]');
        villageRows.forEach(row => {
            const villageId = row.getAttribute('data-id');
            const troopCells = row.querySelectorAll('.troops-cell');
            
            TROOP_TYPES.forEach((troop, idx) => {
                if (idx < troopCells.length) {
                    const cell = troopCells[idx];
                    const checkbox = cell.querySelector('.troop-' + troop.key);
                    const isActive = checkbox ? checkbox.checked : true;
                    
                    if (isActive) {
                        const countSpan = cell.querySelector('.troop-count');
                        if (countSpan) {
                            const count = parseInt(countSpan.textContent.replace(/\s/g, '')) || 0;
                            totals[troop.key] += count;
                        }
                    }
                }
            });
        });
        
        const totalCells = selectAllRow.querySelectorAll('.troops-cell');
        for (let i = 0; i < TROOP_TYPES.length && i < totalCells.length; i++) {
            const total = totals[TROOP_TYPES[i].key];
            const countSpan = totalCells[i].querySelector('.troop-count');
            if (countSpan) {
                countSpan.textContent = total.toLocaleString();
            } else {
                totalCells[i].textContent = total.toLocaleString();
            }
            totalCells[i].title = 'Всего ' + total.toLocaleString() + ' ' + TROOP_TYPES[i].name;
            totalCells[i].style.fontWeight = 'bold';
        }
    }
    
    // ==================== ПОЛУЧЕНИЕ ДАННЫХ О ВОЙСКАХ ====================
    
    async function fetchTroopsData() {
        const baseUrl = window.location.origin;
        const currentVillageId = getCurrentVillageId();
        const babysitterMatch = window.location.href.match(/[?&]t=(\d+)/);
        const babysitterId = babysitterMatch ? babysitterMatch[1] : '';
        
        if (!currentVillageId) {
            console.error('[ЗАГРУЗКА] Не удалось определить ID текущей деревни');
            return null;
        }
        
        try {
            const url = baseUrl + '/game.php?village=' + currentVillageId + '&screen=overview_villages&mode=units&type=own_home' + (babysitterId ? '&t=' + babysitterId : '');
            console.log('[ЗАГРУЗКА] Загрузка:', url);
            
            const response = await fetch(url, { credentials: 'include' });
            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const table = doc.querySelector('#units_table');
            
            if (!table) {
                console.error('[ЗАГРУЗКА] Таблица не найдена');
                return null;
            }
            
            const troopsData = {};
            const rows = table.querySelectorAll('tbody.row_marker');
            
            rows.forEach(row => {
                const quickeditSpan = row.querySelector('.quickedit-vn');
                const villageId = quickeditSpan ? quickeditSpan.getAttribute('data-id') : null;
                
                const villageLink = row.querySelector('td:first-child a');
                let altVillageId = null;
                if (villageLink) {
                    const match = villageLink.href.match(/village=(\d+)/);
                    altVillageId = match ? match[1] : null;
                }
                
                const finalVillageId = villageId || altVillageId;
                
                if (finalVillageId) {
                    const unitCells = row.querySelectorAll('td.unit-item');
                    troopsData[finalVillageId] = {};
                    
                    for (const troop of TROOP_TYPES) {
                        const index = TROOP_OVERVIEW_INDEX[troop.key];
                        let value = 0;
                        if (unitCells[index]) {
                            const cell = unitCells[index];
                            if (!cell.classList.contains('hidden')) {
                                value = parseInt(cell.textContent) || 0;
                            }
                        }
                        troopsData[finalVillageId][troop.key] = value;
                    }
                }
            });
            
            console.log('[ЗАГРУЗКА] Получены данные для ' + Object.keys(troopsData).length + ' деревень');
            return troopsData;
            
        } catch (error) {
            console.error('[ЗАГРУЗКА] Ошибка:', error);
            return null;
        }
    }
    
    // ==================== ПРОВЕРКА СТАТУСОВ ДЛЯ АВТООТПРАВКИ ====================
    
    function isVillageReadyForAutoSend(villageId) {
        const row = document.querySelector('#scavenge_village_' + villageId);
        if (!row) return false;
        
        const autoCheckbox = document.querySelector('.auto-send-checkbox[data-village-id="' + villageId + '"]');
        if (autoCheckbox && !autoCheckbox.checked) return false;
        if (autoCheckbox && autoCheckbox.disabled) return false;
        
        const selectedModes = getSelectedModes(villageId);
        if (selectedModes.length === 0) return false;
        
        // Получаем статусы всех опций
        const optionStatuses = {};
        for (const optId of selectedModes) {
            optionStatuses[optId] = getOptionStatus(villageId, optId);
        }
        
        // Находим inactive опции
        const inactiveOptions = selectedModes.filter(id => optionStatuses[id] === 'inactive');
        if (inactiveOptions.length === 0) return false;
        
        // Проверяем каждую inactive опцию - нет ли у нее активного статуса
        for (const optId of inactiveOptions) {
            const optionCell = row.querySelector('td.option-' + optId);
            if (!optionCell) continue;
            
            const activeImg = optionCell.querySelector('.status-active');
            if (activeImg) {
                const computedStyle = window.getComputedStyle(activeImg);
                if (computedStyle.display !== 'none') {
                    continue;
                }
            }
            
            // Опция inactive и не имеет активного статуса - она готова к отправке!
            console.log('[АВТО] Деревня ' + villageId + ' готова: опция ' + optId + ' свободна');
            return true;
        }
        
        return false;
    }
    
    function getVillagesReadyForAutoSend() {
        document.querySelectorAll('.auto-send-checkbox').forEach(cb => {
            cb.disabled = false;
        });
        
        const rows = document.querySelectorAll('tr[id^="scavenge_village_"]');
        const readyVillages = [];
        
        for (const row of rows) {
            const villageId = row.getAttribute('data-id');
            if (!villageId) continue;
            
            if (isVillageReadyForAutoSend(villageId)) {
                readyVillages.push(villageId);
            }
        }
        
        return readyVillages;
    }
    
    // ==================== АВТООТПРАВКА ====================
    
    function startAutoSend() {
        if (autoSendInterval) {
            clearInterval(autoSendInterval);
            autoSendInterval = null;
        }
        
        autoSendEnabled = true;
        saveAutoSendState(true);
        console.log('[АВТО] Автоотправка включена');
        
        autoSendInterval = setInterval(async () => {
            if (isSendingInProgress) {
                console.log('[АВТО] Отправка уже выполняется, пропускаем...');
                return;
            }
            
            if (isRefreshingTroops) {
                console.log('[АВТО] Обновление войск выполняется, пропускаем...');
                return;
            }
            
            const readyVillages = getVillagesReadyForAutoSend();
            if (readyVillages.length > 0) {
                console.log('[АВТО] Обнаружено ' + readyVillages.length + ' деревень готовых к отправке');
                await autoSendVillages(readyVillages);
            }
        }, 5 * 60 * 1000);
        
        setupAutoSendObserver();
    }
    
    function stopAutoSend() {
        if (autoSendInterval) {
            clearInterval(autoSendInterval);
            autoSendInterval = null;
        }
        autoSendEnabled = false;
        saveAutoSendState(false);
        console.log('[АВТО] Автоотправка выключена');
    }
    
    let autoSendObserver = null;
    
    function setupAutoSendObserver() {
        if (autoSendObserver) {
            autoSendObserver.disconnect();
            autoSendObserver = null;
        }
        
        const table = document.querySelector('.mass-scavenge-table');
        if (!table) return;
        
        autoSendObserver = new MutationObserver(() => {
            if (!autoSendEnabled || isSendingInProgress || isRefreshingTroops) return;
            
            const readyVillages = getVillagesReadyForAutoSend();
            if (readyVillages.length > 0) {
                console.log('[АВТО] MutationObserver: ' + readyVillages.length + ' деревень готовы');
                setTimeout(async () => {
                    if (!isSendingInProgress && !isRefreshingTroops) {
                        await autoSendVillages(readyVillages);
                    }
                }, 1000);
            }
        });
        
        autoSendObserver.observe(table, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['style', 'class']
        });
        
        console.log('[АВТО] MutationObserver настроен');
    }
    
    async function autoSendVillages(villageIds) {
        if (isSendingInProgress) {
            console.log('[АВТО] Отправка уже выполняется');
            return;
        }
        
        if (isRefreshingTroops) {
            console.log('[АВТО] Обновление войск выполняется, ждем...');
            let attempts = 0;
            while (isRefreshingTroops && attempts < 30) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                attempts++;
            }
            if (isRefreshingTroops) {
                console.log('[АВТО] Таймаут ожидания обновления');
                return;
            }
        }
        
        isSendingInProgress = true;
        console.log('[АВТО] Начинаем отправку для ' + villageIds.length + ' деревень');
        
        // ===== ОДИН РАЗ обновляем войска для ВСЕХ деревень =====
        console.log('[АВТО] Обновление войск для всех деревень...');
        const refreshSuccess = await refreshTroopsData();
        
        if (!refreshSuccess) {
            console.log('[АВТО] Не удалось обновить войска, пропускаем отправку');
            isSendingInProgress = false;
            return;
        }
        
        await new Promise(resolve => setTimeout(resolve, WAIT_AFTER_REFRESH));
        
        let sentCount = 0;
        
        // ===== Теперь отправляем все деревья с уже обновленными данными =====
        for (const villageId of villageIds) {
            try {
                const villageName = getVillageName(villageId);
                
                console.log('[АВТО] Отправка: ' + villageName);
                const result = await sendSingleVillage(villageId);
                
                if (result) {
                    sentCount++;
                    console.log('[АВТО] Отправлено: ' + villageName);
                } else {
                    console.log('[АВТО] Пропущено: ' + villageName);
                }
                
            } catch(e) {
                console.error('[АВТО] Ошибка для деревни ' + villageId + ':', e);
            }
        }
        
        isSendingInProgress = false;
        console.log('[АВТО] Отправка завершена. Отправлено: ' + sentCount);
        
        if (sentCount > 0) {
            showNotification('Автоотправка: ' + sentCount + ' деревень отправлено');
        }
    }
    
    // ==================== ОТПРАВКА ОДНОЙ ДЕРЕВНИ ====================
    
    async function sendSingleVillage(villageId) {
        const row = document.querySelector('#scavenge_village_' + villageId);
        if (!row) return false;
        
        const villageName = getVillageName(villageId);
        
        let percent = 100;
        if (!fineTuningEnabled) {
            const percentSelect = row.querySelector('.troops-percent-select');
            if (percentSelect && percentSelect.value) {
                percent = parseInt(percentSelect.value) || 100;
            }
        }
        
        if (!fineTuningEnabled && percent === 0) {
            console.log('[ОТПРАВКА] Пропуск: процент = 0%');
            return false;
        }
        
        const selectedModes = getSelectedModes(villageId);
        if (selectedModes.length === 0) {
            console.log('[ОТПРАВКА] Пропуск: нет выбранных режимов');
            return false;
        }
        
        const troopCells = row.querySelectorAll('.troops-cell');
        if (troopCells.length === 0) return false;
        
        const totalTroops = {};
        TROOP_TYPES.forEach((troop, idx) => {
            const cell = troopCells[idx];
            const countSpan = cell?.querySelector('.troop-count');
            const rawText = countSpan?.textContent || cell?.textContent || '0';
            totalTroops[troop.key] = parseInt(rawText.replace(/\s/g, '')) || 0;
        });
        
        const activeTroops = {};
        let hasAnyActive = false;
        for (const troop of TROOP_TYPES) {
            const checkbox = row.querySelector('.troop-' + troop.key);
            const isChecked = checkbox ? checkbox.checked : true;
            activeTroops[troop.key] = isChecked ? totalTroops[troop.key] : 0;
            if (activeTroops[troop.key] > 0) hasAnyActive = true;
        }
        
        if (!hasAnyActive) {
            console.log('[ОТПРАВКА] Пропуск: нет активных войск');
            return false;
        }
        
        let totalToSend = {};
        for (const troop of TROOP_TYPES) {
            if (fineTuningEnabled) {
                totalToSend[troop.key] = activeTroops[troop.key];
            } else {
                totalToSend[troop.key] = Math.floor(activeTroops[troop.key] * percent / 100);
            }
        }
        
        if (fineTuningEnabled) {
            const limits = getTroopLimits(villageId, totalTroops);
            totalToSend = applyLimits(totalToSend, limits, totalTroops);
            
            const capacityLimit = loadCapacityLimit(villageId);
            totalToSend = applyCapacityLimit(totalToSend, capacityLimit);
        }
        
        const hasAnyToSend = Object.values(totalToSend).some(v => v > 0);
        if (!hasAnyToSend) {
            console.log('[ОТПРАВКА] Пропуск: нет войск для отправки');
            return false;
        }
        
        const optionStatuses = {};
        for (const optId of selectedModes) {
            optionStatuses[optId] = getOptionStatus(villageId, optId);
        }
        
        console.log('[ОТПРАВКА] Статусы опций:', optionStatuses);
        
        const availableOptions = selectedModes.filter(id => optionStatuses[id] === 'inactive');
        
        if (availableOptions.length === 0) {
            console.log('[ОТПРАВКА] Пропуск: нет доступных опций');
            return false;
        }
        
        availableOptions.sort((a, b) => OPTION_RATIOS[b] - OPTION_RATIOS[a]);
        
        const distributionResult = calculateDistributionWithAvailability(
            totalToSend,
            villageId,
            selectedModes
        );
        
        const finalDistribution = distributionResult.finalDistribution;
        const reservedTroops = distributionResult.reservedTroops;
        const activeOptions = distributionResult.activeOptions;
        
        console.log('[ОТПРАВКА] Активные опции для расчета:', activeOptions.join(', '));
        console.log('[ОТПРАВКА] Доступные для отправки:', availableOptions.join(', '));
        console.log('[ОТПРАВКА] Зарезервировано для active:', Object.values(reservedTroops).reduce((a, b) => a + b, 0));
        
        for (const optId of availableOptions) {
            const total = Object.values(finalDistribution[optId]).reduce((a, b) => a + b, 0);
            console.log('[ОТПРАВКА] Опция ' + optId + ' (' + OPTION_NAMES[optId] + '): ' + total + ' войск');
        }
        
        let sentAny = false;
        let sentOptions = [];
        
        for (const optId of availableOptions) {
            const troopsForOption = finalDistribution[optId];
            const optionTitle = OPTION_NAMES[optId];
            
            const troopsForOptionFiltered = applyMinTroops(troopsForOption);
            const hasTroopsToSend = Object.values(troopsForOptionFiltered).some(v => v > 0);
            
            if (!hasTroopsToSend) {
                console.log('[ОТПРАВКА] Опция ' + optId + ' (' + optionTitle + '): нет войск');
                continue;
            }
            
            console.log('[ОТПРАВКА] Отправка опции ' + optId + ' (' + optionTitle + '): ' + 
                Object.values(troopsForOptionFiltered).reduce((a, b) => a + b, 0) + ' войск');
            
            // Заполняем поля ввода
            for (const troop of TROOP_TYPES) {
                setUnitInput(troop.key, troopsForOptionFiltered[troop.key] || 0);
            }
            
            await new Promise(resolve => setTimeout(resolve, WAIT_AFTER_INPUT));
            
            // Получаем информацию о ресурсах ДО отправки
            const optionContainer = document.querySelector('.scavenge-option:nth-child(' + optId + ')');
            let resources = { wood: 0, stone: 0, iron: 0 };
            let duration = '0:00:00';
            let totalCapacity = calculateTotalCapacity(troopsForOptionFiltered);
            
            if (optionContainer) {
                const woodEl = optionContainer.querySelector('.wood-value');
                const stoneEl = optionContainer.querySelector('.stone-value');
                const ironEl = optionContainer.querySelector('.iron-value');
                const durationEl = optionContainer.querySelector('.duration');
                
                // Используем улучшенный парсинг ресурсов
                resources.wood = woodEl ? parseResourceValue(woodEl.textContent) : 0;
                resources.stone = stoneEl ? parseResourceValue(stoneEl.textContent) : 0;
                resources.iron = ironEl ? parseResourceValue(ironEl.textContent) : 0;
                duration = durationEl?.textContent || '0:00:00';
                
                console.log('[ОТПРАВКА] Ресурсы для опции ' + optId + ':', resources);
            }
            
            const sendSuccess = await sendOptionWithRetry(villageId, optId, troopsForOptionFiltered);
            
            if (sendSuccess) {
                sentAny = true;
                sentOptions.push(optId);
                
                addHistoryEntry(villageName, optId, troopsForOptionFiltered, resources, duration, totalCapacity);
                
                const currentTime = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                notifyScavengeSent(villageName, currentTime);
                
                await new Promise(resolve => setTimeout(resolve, WAIT_AFTER_SEND));
                restoreAllDisabled();
            } else {
                console.log('[ОТПРАВКА] Опция ' + optId + ' (' + optionTitle + ') не отправлена');
            }
            
            clearAllInputs();
            await new Promise(resolve => setTimeout(resolve, WAIT_BETWEEN_OPTIONS));
        }
        
        if (sentOptions.length > 0) {
            console.log('[ОТПРАВКА] Отправлены опции: ' + sentOptions.join(', ') + ' для ' + villageName);
        } else {
            console.log('[ОТПРАВКА] Не отправлено ни одной опции для ' + villageName);
        }
        
        return sentAny;
    }
    
    // ==================== ОТПРАВКА С ПРОВЕРКОЙ ====================
    
    async function sendOptionWithRetry(villageId, optId, troopsForOption) {
        for (const troop of TROOP_TYPES) {
            setUnitInput(troop.key, troopsForOption[troop.key] || 0);
        }
        
        await new Promise(resolve => setTimeout(resolve, WAIT_AFTER_INPUT));
        
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            console.log('[ОТПРАВКА] Попытка ' + attempt + '/' + MAX_RETRIES + '...');
            
            const beforeState = getScavengeState(villageId);
            
            const success = setOnlyThisOption(villageId, optId);
            if (!success) {
                console.log('[ОТПРАВКА] Не удалось выбрать опцию ' + optId);
                continue;
            }
            
            const sendButton = document.querySelector('.send-row .btn-send');
            if (!sendButton || sendButton.hasAttribute('disabled')) {
                console.log('[ОТПРАВКА] Кнопка отправки недоступна');
                continue;
            }
            
            sendButton.click();
            console.log('[ОТПРАВКА] Отправлено (попытка ' + attempt + ')');
            
            const confirmed = await wasScavengeSent(villageId, beforeState);
            
            if (confirmed) {
                console.log('[ОТПРАВКА] Подтверждено!');
                return true;
            }
            
            const errorMsg = document.querySelector('.error_msg, .alert-error, .error');
            if (errorMsg) {
                console.log('[ОТПРАВКА] Ошибка: ' + errorMsg.textContent.trim());
                const closeBtn = document.querySelector('.error_msg .close, .alert-error .close');
                if (closeBtn) closeBtn.click();
            }
            
            if (attempt < MAX_RETRIES) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                clearAllInputs();
                for (const troop of TROOP_TYPES) {
                    setUnitInput(troop.key, troopsForOption[troop.key] || 0);
                }
                await new Promise(resolve => setTimeout(resolve, WAIT_AFTER_INPUT));
            }
        }
        
        return false;
    }
    
    // ==================== ДОБАВЛЕНИЕ КОЛОНОК В ТАБЛИЦУ ====================
    
    async function addTroopColumnsToScavengeTable() {
        console.log('[ИНТЕРФЕЙС] Добавление колонок...');
        
        const troopsData = await fetchTroopsData();
        if (!troopsData) {
            console.error('[ИНТЕРФЕЙС] Не удалось получить данные о войсках');
            return false;
        }
        
        const scavengeTable = document.querySelector('.mass-scavenge-table');
        if (!scavengeTable) return false;
        
        const thead = scavengeTable.querySelector('thead');
        const headerRow = thead?.querySelector('tr');
        if (!headerRow) return false;
        
        const oldHeaders = headerRow.querySelectorAll('.modes-header, .percent-header, .capacity-header, .auto-header, .troops-header');
        oldHeaders.forEach(el => el.remove());
        
        const firstTh = headerRow.querySelector('th:first-child');
        
        const modesTh = document.createElement('th');
        modesTh.className = 'modes-header';
        modesTh.style.cssText = 'text-align: center; width: 180px; padding: 4px;';
        
        const modesContainer = document.createElement('div');
        modesContainer.style.cssText = 'display: flex; gap: 8px; justify-content: center;';
        
        for (let optId = 1; optId <= 4; optId++) {
            const img = document.createElement('img');
            img.src = 'https://dsru.innogamescdn.com/asset/8e371e58/graphic//scavenging/options/' + optId + '.png';
            img.style.width = '20px';
            img.style.height = '20px';
            img.style.cursor = 'help';
            img.title = OPTION_NAMES[optId];
            modesContainer.appendChild(img);
        }
        
        modesTh.appendChild(modesContainer);
        firstTh.insertAdjacentElement('afterend', modesTh);
        
        const percentTh = document.createElement('th');
        percentTh.className = 'percent-header';
        percentTh.textContent = '%';
        percentTh.title = 'Процент войск для отправки';
        percentTh.style.cssText = 'text-align: center; width: 50px; padding: 4px;';
        modesTh.insertAdjacentElement('afterend', percentTh);
        
        const capacityTh = document.createElement('th');
        capacityTh.className = 'capacity-header';
        capacityTh.textContent = 'Лимит';
        capacityTh.title = 'Лимит грузоподъемности (только при тонкой настройке)';
        capacityTh.style.cssText = 'text-align: center; width: 80px; padding: 4px; font-size: 11px;';
        percentTh.insertAdjacentElement('afterend', capacityTh);
        
        const autoTh = document.createElement('th');
        autoTh.className = 'auto-header';
        autoTh.textContent = '🤖';
        autoTh.title = 'Автоотправка для этой деревни';
        autoTh.style.cssText = 'text-align: center; width: 40px; padding: 4px;';
        capacityTh.insertAdjacentElement('afterend', autoTh);
        
        let lastElement = autoTh;
        for (const troop of TROOP_TYPES) {
            const th = document.createElement('th');
            th.className = 'troops-header';
            th.style.cssText = 'text-align: center; width: 100px; padding: 4px;';
            th.title = troop.name;
            
            const img = document.createElement('img');
            img.src = 'https://dsru.innogamescdn.com/asset/8e371e58/graphic/unit/unit_' + troop.key + '.png';
            img.style.width = '20px';
            img.style.height = '20px';
            img.style.verticalAlign = 'middle';
            th.appendChild(img);
            
            lastElement.insertAdjacentElement('afterend', th);
            lastElement = th;
        }
        
        const allSelectTh = headerRow.querySelector('th:last-child');
        if (allSelectTh && !allSelectTh.querySelector('img')) {
            allSelectTh.remove();
        }
        
        const villageRows = scavengeTable.querySelectorAll('tbody tr[id^="scavenge_village_"]');
        console.log('[ИНТЕРФЕЙС] Найдено деревень: ' + villageRows.length);
        
        function toggleFineTuningVisibility() {
            const percentCells = document.querySelectorAll('.percent-cell');
            const capacityCells = document.querySelectorAll('.capacity-cell');
            const fineTuningContainers = document.querySelectorAll('.fine-tuning-container');
            
            if (fineTuningEnabled) {
                percentCells.forEach(cell => cell.style.display = 'none');
                capacityCells.forEach(cell => cell.style.display = 'table-cell');
                fineTuningContainers.forEach(container => {
                    container.style.display = 'block';
                });
                const percentHeader = document.querySelector('.percent-header');
                if (percentHeader) percentHeader.style.display = 'none';
                const capacityHeader = document.querySelector('.capacity-header');
                if (capacityHeader) capacityHeader.style.display = 'table-cell';
            } else {
                percentCells.forEach(cell => cell.style.display = 'table-cell');
                capacityCells.forEach(cell => cell.style.display = 'none');
                fineTuningContainers.forEach(container => {
                    container.style.display = 'none';
                });
                const percentHeader = document.querySelector('.percent-header');
                if (percentHeader) percentHeader.style.display = 'table-cell';
                const capacityHeader = document.querySelector('.capacity-header');
                if (capacityHeader) capacityHeader.style.display = 'none';
            }
        }
        
        villageRows.forEach(row => {
            const villageId = row.getAttribute('data-id');
            const troops = troopsData[villageId];
            
            if (!troops) return;
            
            const firstTd = row.querySelector('td:first-child');
            
            const existingCells = row.querySelectorAll('.modes-cell, .percent-cell, .capacity-cell, .auto-cell, .troops-cell');
            existingCells.forEach(cell => cell.remove());
            
            const modesTd = document.createElement('td');
            modesTd.className = 'modes-cell';
            modesTd.style.cssText = 'text-align: center; padding: 2px;';
            
            const modesContainer = document.createElement('div');
            modesContainer.style.cssText = 'display: flex; gap: 5px; justify-content: center; flex-wrap: wrap;';
            
            const savedModes = loadSelectedModes(villageId);
            
            for (let optId = 1; optId <= 4; optId++) {
                const label = document.createElement('label');
                label.style.cssText = 'display: inline-flex; flex-direction: column; align-items: center; cursor: pointer; margin: 2px;';
                label.title = OPTION_NAMES[optId];
                
                const img = document.createElement('img');
                img.src = 'https://dsru.innogamescdn.com/asset/8e371e58/graphic//scavenging/options/' + optId + '.png';
                img.style.width = '18px';
                img.style.height = '18px';
                img.style.display = 'block';
                
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'mode-checkbox mode-' + optId;
                checkbox.setAttribute('data-village-id', villageId);
                checkbox.setAttribute('data-mode-id', optId);
                checkbox.style.margin = '2px auto';
                checkbox.style.cursor = 'pointer';
                checkbox.checked = savedModes.includes(optId);
                
                checkbox.addEventListener('change', () => {
                    const selectedModes = [];
                    for (let id = 1; id <= 4; id++) {
                        const cb = modesContainer.querySelector('.mode-' + id);
                        if (cb && cb.checked) selectedModes.push(id);
                    }
                    saveSelectedModes(villageId, selectedModes);
                });
                
                label.appendChild(img);
                label.appendChild(checkbox);
                modesContainer.appendChild(label);
            }
            
            modesTd.appendChild(modesContainer);
            firstTd.insertAdjacentElement('afterend', modesTd);
            
            const percentTd = document.createElement('td');
            percentTd.className = 'percent-cell';
            percentTd.style.cssText = 'text-align: center; padding: 2px;';
            
            const percentSelect = document.createElement('select');
            percentSelect.className = 'troops-percent-select';
            percentSelect.style.cssText = 'width: 50px; padding: 2px; font-size: 11px; text-align: center;';
            percentSelect.setAttribute('data-village-id', villageId);
            
            for (let pct = 0; pct <= 100; pct += 10) {
                const option = document.createElement('option');
                option.value = pct;
                option.textContent = pct + '%';
                if (pct === 100) option.selected = true;
                percentSelect.appendChild(option);
            }
            
            percentSelect.value = loadPercent(villageId);
            
            percentSelect.addEventListener('change', (e) => {
                savePercent(villageId, e.target.value);
                updateTotalRow();
            });
            
            percentTd.appendChild(percentSelect);
            modesTd.insertAdjacentElement('afterend', percentTd);
            
            const capacityTd = document.createElement('td');
            capacityTd.className = 'capacity-cell';
            capacityTd.style.cssText = 'text-align: center; padding: 2px; display: none;';
            
            const capacityInput = document.createElement('input');
            capacityInput.type = 'text';
            capacityInput.className = 'capacity-limit-input';
            capacityInput.placeholder = 'лимит';
            capacityInput.title = 'Лимит грузоподъемности (например: 5000)';
            capacityInput.style.cssText = 'width: 70px; font-size: 11px; padding: 3px; border: 1px solid #ccc; border-radius: 3px; text-align: center;';
            capacityInput.value = loadCapacityLimit(villageId);
            
            capacityInput.addEventListener('change', (e) => {
                saveCapacityLimit(villageId, e.target.value);
            });
            
            capacityTd.appendChild(capacityInput);
            percentTd.insertAdjacentElement('afterend', capacityTd);
            
            const autoTd = document.createElement('td');
            autoTd.className = 'auto-cell';
            autoTd.style.cssText = 'text-align: center; padding: 2px;';
            
            const autoCheckbox = document.createElement('input');
            autoCheckbox.type = 'checkbox';
            autoCheckbox.className = 'auto-send-checkbox';
            autoCheckbox.setAttribute('data-village-id', villageId);
            autoCheckbox.style.cssText = 'cursor: pointer; transform: scale(1.2);';
            autoCheckbox.title = 'Включить автоотправку для этой деревни';
            autoCheckbox.checked = true;
            
            autoTd.appendChild(autoCheckbox);
            capacityTd.insertAdjacentElement('afterend', autoTd);
            
            let lastCell = autoTd;
            for (const troop of TROOP_TYPES) {
                const td = document.createElement('td');
                td.className = 'troops-cell';
                td.style.cssText = 'text-align: center; font-size: 12px; padding: 4px; white-space: nowrap; vertical-align: middle;';
                
                const count = troops[troop.key] || 0;
                
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'troop-checkbox troop-' + troop.key;
                checkbox.setAttribute('data-village-id', villageId);
                checkbox.setAttribute('data-troop-type', troop.key);
                checkbox.style.marginRight = '3px';
                checkbox.style.cursor = 'pointer';
                checkbox.style.verticalAlign = 'middle';
                checkbox.checked = loadTroopSelection(villageId, troop.key);
                
                checkbox.addEventListener('change', (e) => {
                    saveTroopSelection(villageId, troop.key, e.target.checked);
                    updateTotalRow();
                    const countSpan = td.querySelector('.troop-count');
                    if (countSpan) {
                        if (!e.target.checked) {
                            countSpan.style.color = '#999';
                            countSpan.style.textDecoration = 'line-through';
                        } else {
                            countSpan.style.color = '';
                            countSpan.style.textDecoration = '';
                        }
                    }
                });
                
                const countSpan = document.createElement('span');
                countSpan.className = 'troop-count';
                countSpan.textContent = count.toLocaleString();
                countSpan.title = count.toLocaleString() + ' ' + troop.name + ' (грузоподъемность: ' + troop.carry + ')';
                countSpan.style.fontWeight = 'bold';
                countSpan.style.marginLeft = '3px';
                
                if (!checkbox.checked) {
                    countSpan.style.color = '#999';
                    countSpan.style.textDecoration = 'line-through';
                }
                
                const fineTuningDiv = document.createElement('div');
                fineTuningDiv.className = 'fine-tuning-container';
                fineTuningDiv.style.cssText = 'margin-top: 5px; display: none;';
                
                const limitLabel = document.createElement('div');
                limitLabel.textContent = 'Не более';
                limitLabel.style.cssText = 'font-size: 9px; color: #666; line-height: 1.2;';
                
                const limitInput = document.createElement('input');
                limitInput.type = 'text';
                limitInput.className = 'troop-limit-input troop-limit-' + troop.key;
                limitInput.placeholder = 'лимит';
                limitInput.title = 'Максимум (число или %, например: 1000 или 50%)';
                limitInput.style.cssText = 'width: 60px; font-size: 10px; padding: 2px; border: 1px solid #ccc; border-radius: 3px; text-align: center; margin-top: 2px;';
                limitInput.value = loadTroopLimit(villageId, troop.key);
                
                limitInput.addEventListener('change', (e) => {
                    saveTroopLimit(villageId, troop.key, e.target.value);
                });
                
                fineTuningDiv.appendChild(limitLabel);
                fineTuningDiv.appendChild(limitInput);
                
                td.appendChild(checkbox);
                td.appendChild(countSpan);
                td.appendChild(fineTuningDiv);
                
                lastCell.insertAdjacentElement('afterend', td);
                lastCell = td;
            }
            
            const lastTd = row.querySelector('td:last-child');
            if (lastTd && lastTd.querySelector('input[type="checkbox"]') && 
                lastTd.querySelector('input[type="checkbox"]')?.className === 'select-all-col') {
                lastTd.remove();
            }
        });
        
        const selectAllRow = Array.from(scavengeTable.querySelectorAll('tbody tr')).find(row => 
            row.querySelector('strong')?.textContent === 'Выбрать все'
        );
        if (selectAllRow) {
            selectAllRow.remove();
        }
        
        toggleFineTuningVisibility();
        
        console.log('[ИНТЕРФЕЙС] Колонки добавлены');
        return true;
    }
    
    // ==================== ОТОБРАЖЕНИЕ ИСТОРИИ ====================
    
    function showHistoryModal() {
        const existingModal = document.getElementById('scavenge-history-modal');
        if (existingModal) existingModal.remove();
        
        loadHistory();
        
        let historyHtml = '';
        
        if (sendHistory.length === 0) {
            historyHtml = '<div style="text-align: center; padding: 40px; color: #666;">История отправок пуста</div>';
        } else {
            let tableHeaders = `
                <th style="padding: 8px; text-align: center;">Дата</th>
                <th style="padding: 8px; text-align: center;">Время</th>
                <th style="padding: 8px; text-align: left;">Деревня</th>
                <th style="padding: 8px; text-align: center;">Опция</th>
                <th style="padding: 8px; text-align: center;">Вместимость</th>
                <th style="padding: 8px; text-align: center;">Время</th>
                <th style="padding: 8px; text-align: right;">Дерево</th>
                <th style="padding: 8px; text-align: right;">Камень</th>
                <th style="padding: 8px; text-align: right;">Железо</th>
                <th style="padding: 8px; text-align: right;">Всего</th>
            `;
            
            let tableRows = '';
            const reversedHistory = [...sendHistory].reverse();
            
            for (const entry of reversedHistory) {
                tableRows += `
                    <tr style="border-bottom: 1px solid #e0d5b0;">
                        <td style="padding: 6px; text-align: center; font-size: 12px;">${entry.date || '-'}</td>
                        <td style="padding: 6px; text-align: center; font-size: 12px; font-weight: bold;">${entry.time || '-'}</td>
                        <td style="padding: 6px; text-align: left; font-size: 12px;">${entry.village}</td>
                        <td style="padding: 6px; text-align: center; font-size: 12px;">${entry.optionId} (${entry.optionName})</td>
                        <td style="padding: 6px; text-align: center; font-size: 12px;">${(entry.totalCapacity || 0).toLocaleString()}</td>
                        <td style="padding: 6px; text-align: center; font-size: 12px;">${entry.duration || '-'}</td>
                        <td style="padding: 6px; text-align: right; font-size: 12px; color: #8B6914;">${(entry.resources?.wood || 0).toLocaleString()}</td>
                        <td style="padding: 6px; text-align: right; font-size: 12px; color: #666;">${(entry.resources?.stone || 0).toLocaleString()}</td>
                        <td style="padding: 6px; text-align: right; font-size: 12px; color: #444;">${(entry.resources?.iron || 0).toLocaleString()}</td>
                        <td style="padding: 6px; text-align: right; font-size: 12px; font-weight: bold;">${(entry.totalResources || 0).toLocaleString()}</td>
                    </tr>
                `;
            }
            
            historyHtml = `
                <div style="overflow-x: auto;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                        <thead>
                            <tr style="background: rgb(210, 180, 100);">
                                ${tableHeaders}
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRows}
                        </tbody>
                    </table>
                </div>
                <div style="margin-top: 10px; font-size: 12px; color: #666; text-align: right;">
                    Всего записей: ${sendHistory.length}
                </div>
            `;
        }
        
        const modalHtml = `
            <div id="scavenge-history-modal" style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 95%; max-width: 1400px; max-height: 85%; background: rgb(244, 228, 188); border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.3); z-index: 10000; display: flex; flex-direction: column; font-family: Arial, sans-serif; border: 2px solid rgb(210, 180, 100);">
                <div style="padding: 15px 20px; background: rgb(210, 180, 100); border-radius: 10px 10px 0 0; display: flex; justify-content: space-between; align-items: center;">
                    <h2 style="margin: 0; color: #2c3e50;">История отправок</h2>
                    <div>
                        <button id="clear-history-btn" style="padding: 5px 15px; background: #c0392b; color: white; border: none; border-radius: 5px; cursor: pointer; margin-right: 10px; font-size: 13px;">Сбросить данные</button>
                        <button id="close-history-modal" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #2c3e50;">&times;</button>
                    </div>
                </div>
                <div style="padding: 20px; overflow-y: auto; flex: 1;">
                    ${historyHtml}
                </div>
                <div style="padding: 15px 20px; background: rgb(210, 180, 100); border-radius: 0 0 10px 10px; text-align: center;">
                    <button id="close-history-modal-footer" style="padding: 8px 20px; background: #2c3e50; color: white; border: none; border-radius: 5px; cursor: pointer;">Закрыть</button>
                </div>
            </div>
            <div id="scavenge-history-overlay" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 9999;"></div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        const closeModal = () => {
            document.getElementById('scavenge-history-modal')?.remove();
            document.getElementById('scavenge-history-overlay')?.remove();
        };
        
        document.getElementById('close-history-modal')?.addEventListener('click', closeModal);
        document.getElementById('close-history-modal-footer')?.addEventListener('click', closeModal);
        document.getElementById('scavenge-history-overlay')?.addEventListener('click', closeModal);
        
        document.getElementById('clear-history-btn')?.addEventListener('click', () => {
            clearHistory();
            closeModal();
            setTimeout(() => showHistoryModal(), 300);
        });
    }
    
    function updateHistoryUI() {
        const historyBtn = document.querySelector('.btn-history');
        if (historyBtn) {
            const count = sendHistory.length;
            historyBtn.textContent = 'История (' + count + ')';
        }
    }
    
    // ==================== ФУНКЦИЯ РАСЧЕТА ====================
    
    async function calculateAllScavengeOptions() {
        console.log('[РАСЧЕТ] Запуск...');
        
        await refreshTroopsData();
        
        const scavengeTable = document.querySelector('.mass-scavenge-table');
        const villageRows = scavengeTable.querySelectorAll('tbody tr[id^="scavenge_village_"]');
        
        const allResults = [];
        
        for (const row of villageRows) {
            const villageId = row.getAttribute('data-id');
            const villageName = getVillageName(villageId);
            
            console.log('[РАСЧЕТ] Обработка: ' + villageName + ' (' + villageId + ')');
            
            let percent = 100;
            if (!fineTuningEnabled) {
                const percentSelect = row.querySelector('.troops-percent-select');
                if (percentSelect && percentSelect.value) {
                    percent = parseInt(percentSelect.value) || 100;
                }
            }
            
            if (!fineTuningEnabled && percent === 0) {
                allResults.push({ villageName, results: [], skipped: true, reason: '0%' });
                continue;
            }
            
            const selectedModes = getSelectedModes(villageId);
            if (selectedModes.length === 0) {
                allResults.push({ villageName, results: [], skipped: true, reason: 'no modes' });
                continue;
            }
            
            const troopCells = row.querySelectorAll('.troops-cell');
            if (troopCells.length === 0) continue;
            
            const totalTroops = {};
            TROOP_TYPES.forEach((troop, idx) => {
                const cell = troopCells[idx];
                const countSpan = cell?.querySelector('.troop-count');
                const rawText = countSpan?.textContent || cell?.textContent || '0';
                totalTroops[troop.key] = parseInt(rawText.replace(/\s/g, '')) || 0;
            });
            
            const activeTroops = {};
            let hasAnyActive = false;
            for (const troop of TROOP_TYPES) {
                const checkbox = row.querySelector('.troop-' + troop.key);
                const isChecked = checkbox ? checkbox.checked : true;
                activeTroops[troop.key] = isChecked ? totalTroops[troop.key] : 0;
                if (activeTroops[troop.key] > 0) hasAnyActive = true;
            }
            
            if (!hasAnyActive) {
                allResults.push({ villageName, results: [], skipped: true, reason: 'no active troops' });
                continue;
            }
            
            let totalToSend = {};
            for (const troop of TROOP_TYPES) {
                if (fineTuningEnabled) {
                    totalToSend[troop.key] = activeTroops[troop.key];
                } else {
                    totalToSend[troop.key] = Math.floor(activeTroops[troop.key] * percent / 100);
                }
            }
            
            if (fineTuningEnabled) {
                const limits = getTroopLimits(villageId, totalTroops);
                totalToSend = applyLimits(totalToSend, limits, totalTroops);
                
                const capacityLimit = loadCapacityLimit(villageId);
                totalToSend = applyCapacityLimit(totalToSend, capacityLimit);
            }
            
            const hasAnyToSend = Object.values(totalToSend).some(v => v > 0);
            if (!hasAnyToSend) {
                allResults.push({ villageName, totalToSend, results: [], skipped: true, reason: 'no troops after limits' });
                continue;
            }
            
            const optionStatuses = {};
            for (const optId of selectedModes) {
                optionStatuses[optId] = getOptionStatus(villageId, optId);
            }
            
            const availableOptions = selectedModes.filter(id => optionStatuses[id] === 'inactive');
            
            if (availableOptions.length === 0) {
                allResults.push({ villageName, totalToSend, results: [] });
                continue;
            }
            
            availableOptions.sort((a, b) => OPTION_RATIOS[b] - OPTION_RATIOS[a]);
            
            const distributionResult = calculateDistributionWithAvailability(
                totalToSend,
                villageId,
                selectedModes
            );
            
            const finalDistribution = distributionResult.finalDistribution;
            
            const villageResults = [];
            
            for (const optId of availableOptions) {
                const troopsForOption = finalDistribution[optId];
                const troopsForOptionFiltered = applyMinTroops(troopsForOption);
                const hasTroopsForOption = Object.values(troopsForOptionFiltered).some(v => v > 0);
                
                if (!hasTroopsForOption) continue;
                
                for (const troop of TROOP_TYPES) {
                    setUnitInput(troop.key, troopsForOptionFiltered[troop.key] || 0);
                }
                
                await new Promise(resolve => setTimeout(resolve, WAIT_AFTER_INPUT));
                
                const optionContainer = document.querySelector('.scavenge-option:nth-child(' + optId + ')');
                if (optionContainer) {
                    const woodEl = optionContainer.querySelector('.wood-value');
                    const stoneEl = optionContainer.querySelector('.stone-value');
                    const ironEl = optionContainer.querySelector('.iron-value');
                    const durationEl = optionContainer.querySelector('.duration');
                    
                    const wood = woodEl ? parseResourceValue(woodEl.textContent) : 0;
                    const stone = stoneEl ? parseResourceValue(stoneEl.textContent) : 0;
                    const iron = ironEl ? parseResourceValue(ironEl.textContent) : 0;
                    const duration = durationEl?.textContent || '0:00:00';
                    
                    let totalRatioAll = 0;
                    for (const id of selectedModes) {
                        totalRatioAll += OPTION_RATIOS[id];
                    }
                    
                    villageResults.push({
                        optionId: optId,
                        title: OPTION_NAMES[optId],
                        fraction: OPTION_RATIOS[optId] / totalRatioAll,
                        troopsToSend: { ...troopsForOptionFiltered },
                        resources: { wood, stone, iron, total: wood + stone + iron },
                        duration: duration,
                        totalCapacity: calculateTotalCapacity(troopsForOptionFiltered)
                    });
                }
                
                clearAllInputs();
                await new Promise(resolve => setTimeout(resolve, WAIT_BETWEEN_OPTIONS));
            }
            
            allResults.push({
                villageName: villageName,
                villageId: villageId,
                percent: fineTuningEnabled ? 'лимиты' : percent,
                fineTuningEnabled: fineTuningEnabled,
                selectedModes: selectedModes,
                availableOptions: availableOptions,
                optionStatuses: optionStatuses,
                totalToSend: totalToSend,
                results: villageResults
            });
        }
        
        showResultsModal(allResults);
        return allResults;
    }
    
    // ==================== ФУНКЦИЯ МАССОВОЙ ОТПРАВКИ ====================
    
    async function massSendScavenge() {
        console.log('[МАСС] Массовая отправка сборов');
        
        console.log('[МАСС] Обновление данных о войсках...');
        await refreshTroopsData();
        await new Promise(resolve => setTimeout(resolve, WAIT_AFTER_REFRESH));
        
        const scavengeTable = document.querySelector('.mass-scavenge-table');
        const villageRows = scavengeTable.querySelectorAll('tbody tr[id^="scavenge_village_"]');
        
        let totalSent = 0;
        
        for (const row of villageRows) {
            const villageId = row.getAttribute('data-id');
            const villageName = getVillageName(villageId);
            
            const result = await sendSingleVillage(villageId);
            if (result) totalSent++;
        }
        
        console.log('[МАСС] Отправка завершена. Отправлено деревень: ' + totalSent);
        return totalSent;
    }
    
    // ==================== ОТОБРАЖЕНИЕ РЕЗУЛЬТАТОВ ====================
    
    function showResultsModal(allResults) {
        const existingModal = document.getElementById('scavenge-results-modal');
        if (existingModal) existingModal.remove();
        
        let totalWood = 0, totalStone = 0, totalIron = 0;
        const totalTroops = {};
        for (const troop of TROOP_TYPES) totalTroops[troop.key] = 0;
        let totalOptions = 0;
        let globalMaxDuration = '0:00:00';
        let globalMaxSeconds = 0;
        
        for (const item of allResults) {
            for (const result of item.results) {
                totalWood += result.resources.wood;
                totalStone += result.resources.stone;
                totalIron += result.resources.iron;
                for (const troop of TROOP_TYPES) {
                    totalTroops[troop.key] += result.troopsToSend[troop.key] || 0;
                }
                totalOptions++;
                
                const seconds = parseDuration(result.duration);
                if (seconds > globalMaxSeconds) {
                    globalMaxSeconds = seconds;
                    globalMaxDuration = result.duration;
                }
            }
        }
        
        let resultsHtml = '';
        
        for (const item of allResults) {
            if (item.results.length === 0) {
                resultsHtml += `
                    <div style="margin-bottom: 25px; background: rgba(255,255,255,0.5); border-radius: 8px; padding: 12px;">
                        <h3 style="margin: 0 0 10px 0; color: #2c3e50;">${item.villageName}</h3>
                        <div style="color: #999; padding: 10px;">${item.skipped ? 'Пропущена (' + item.reason + ')' : 'Нет доступных опций'}</div>
                    </div>
                `;
                continue;
            }
            
            let statusHtml = '';
            if (item.optionStatuses) {
                const statusLabels = {
                    'inactive': 'Доступна',
                    'active': 'Идет сбор',
                    'locked': 'Не изучена',
                    'unlocking': 'Исследуется'
                };
                statusHtml = Object.entries(item.optionStatuses)
                    .map(([id, status]) => 'Опция ' + id + ': ' + (statusLabels[status] || status))
                    .join(' | ');
            }
            
            let tableHeaders = '<th style="padding: 8px; text-align: center;">Опция</th><th style="padding: 8px; text-align: center;">%</th>';
            for (const troop of TROOP_TYPES) {
                tableHeaders += '<th style="padding: 8px; text-align: center;">' + troop.icon + '</th>';
            }
            tableHeaders += '<th style="padding: 8px; text-align: center;">Вместимость</th><th style="padding: 8px; text-align: center;">Дерево</th><th style="padding: 8px; text-align: center;">Камень</th><th style="padding: 8px; text-align: center;">Железо</th><th style="padding: 8px; text-align: center;">Время</th>';
            
            let tableRows = '';
            for (const result of item.results) {
                let troopsCells = '';
                for (const troop of TROOP_TYPES) {
                    troopsCells += '<td style="padding: 6px; text-align: right;">' + (result.troopsToSend[troop.key] || 0).toLocaleString() + '</td>';
                }
                
                tableRows += `
                    <tr style="border-bottom: 1px solid rgb(210, 180, 100);">
                        <td style="padding: 6px; text-align: center;">${result.optionId} (${result.title})</td>
                        <td style="padding: 6px; text-align: center;">${Math.round(result.fraction * 100)}%</td>
                        ${troopsCells}
                        <td style="padding: 6px; text-align: center;">${(result.totalCapacity || 0).toLocaleString()}</td>
                        <td style="padding: 6px; text-align: right;">${result.resources.wood.toLocaleString()}</td>
                        <td style="padding: 6px; text-align: right;">${result.resources.stone.toLocaleString()}</td>
                        <td style="padding: 6px; text-align: right;">${result.resources.iron.toLocaleString()}</td>
                        <td style="padding: 6px; text-align: center;">${result.duration}</td>
                    </tr>
                `;
            }
            
            resultsHtml += `
                <div style="margin-bottom: 25px; background: rgba(255,255,255,0.5); border-radius: 8px; padding: 12px;">
                    <h3 style="margin: 0 0 10px 0; color: #2c3e50;">${item.villageName} ${item.fineTuningEnabled ? '(лимиты)' : '(' + item.percent + '%)'}</h3>
                    <div style="font-size: 11px; color: #666; margin-bottom: 8px;">
                        Выбранные: ${item.selectedModes?.join(', ') || 'все'}
                        ${item.availableOptions ? ' | Доступные: ' + item.availableOptions.join(', ') : ''}
                        ${statusHtml ? ' | ' + statusHtml : ''}
                    </div>
                    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                        <thead>
                            <tr style="background: rgb(210, 180, 100);">
                                ${tableHeaders}
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRows}
                        </tbody>
                    </table>
                </div>
            `;
        }
        
        let statsTroopsHtml = '';
        for (const troop of TROOP_TYPES) {
            statsTroopsHtml += troop.icon + ' ' + troop.name + ': ' + totalTroops[troop.key].toLocaleString() + '<br>';
        }
        
        const modalWidth = hasArchers ? '1600px' : '1400px';
        
        const modalHtml = `
            <div id="scavenge-results-modal" style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 90%; max-width: ${modalWidth}; max-height: 85%; background: rgb(244, 228, 188); border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.3); z-index: 10000; display: flex; flex-direction: column; font-family: Arial, sans-serif; border: 2px solid rgb(210, 180, 100);">
                <div style="padding: 15px 20px; background: rgb(210, 180, 100); border-radius: 10px 10px 0 0; display: flex; justify-content: space-between; align-items: center;">
                    <h2 style="margin: 0; color: #2c3e50;">Результаты расчета сборов</h2>
                    <button id="close-results-modal" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #2c3e50;">&times;</button>
                </div>
                <div style="padding: 20px; overflow-y: auto; flex: 1;">
                    ${resultsHtml}
                    <div style="background: rgb(210, 180, 100); border-radius: 8px; padding: 15px; margin-top: 10px;">
                        <h3 style="margin: 0 0 10px 0; color: #2c3e50;">Общая статистика</h3>
                        <div style="display: flex; flex-wrap: wrap; gap: 20px;">
                            <div>
                                <strong>Всего войск:</strong><br>
                                ${statsTroopsHtml}
                            </div>
                            <div>
                                <strong>Всего ресурсов:</strong><br>
                                Дерево: ${totalWood.toLocaleString()}<br>
                                Камень: ${totalStone.toLocaleString()}<br>
                                Железо: ${totalIron.toLocaleString()}<br>
                                <strong>ВСЕГО: ${(totalWood + totalStone + totalIron).toLocaleString()}</strong>
                            </div>
                            <div>
                                <strong>Время:</strong><br>
                                Максимальное: ${globalMaxDuration}<br>
                                Всего опций: ${totalOptions}
                            </div>
                        </div>
                    </div>
                </div>
                <div style="padding: 15px 20px; background: rgb(210, 180, 100); border-radius: 0 0 10px 10px; text-align: center;">
                    <button id="close-results-modal-footer" style="padding: 8px 20px; background: #2c3e50; color: white; border: none; border-radius: 5px; cursor: pointer;">Закрыть</button>
                </div>
            </div>
            <div id="scavenge-results-overlay" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 9999;"></div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        const closeModal = () => {
            document.getElementById('scavenge-results-modal')?.remove();
            document.getElementById('scavenge-results-overlay')?.remove();
        };
        
        document.getElementById('close-results-modal')?.addEventListener('click', closeModal);
        document.getElementById('close-results-modal-footer')?.addEventListener('click', closeModal);
        document.getElementById('scavenge-results-overlay')?.addEventListener('click', closeModal);
    }
    
    // ==================== ПЕРЕКЛЮЧЕНИЕ ТОНКОЙ НАСТРОЙКИ ====================
    
    function toggleFineTuning(button) {
        fineTuningEnabled = !fineTuningEnabled;
        saveFineTuningState(fineTuningEnabled);
        
        if (button) {
            button.textContent = fineTuningEnabled ? 'Тонкая настройка (вкл)' : 'Тонкая настройка (выкл)';
        }
        
        const percentCells = document.querySelectorAll('.percent-cell');
        const capacityCells = document.querySelectorAll('.capacity-cell');
        const fineTuningContainers = document.querySelectorAll('.fine-tuning-container');
        
        if (fineTuningEnabled) {
            percentCells.forEach(cell => cell.style.display = 'none');
            capacityCells.forEach(cell => cell.style.display = 'table-cell');
            fineTuningContainers.forEach(container => {
                container.style.display = 'block';
            });
            const percentHeader = document.querySelector('.percent-header');
            if (percentHeader) percentHeader.style.display = 'none';
            const capacityHeader = document.querySelector('.capacity-header');
            if (capacityHeader) capacityHeader.style.display = 'table-cell';
        } else {
            percentCells.forEach(cell => cell.style.display = 'table-cell');
            capacityCells.forEach(cell => cell.style.display = 'none');
            fineTuningContainers.forEach(container => {
                container.style.display = 'none';
            });
            const percentHeader = document.querySelector('.percent-header');
            if (percentHeader) percentHeader.style.display = 'table-cell';
            const capacityHeader = document.querySelector('.capacity-header');
            if (capacityHeader) capacityHeader.style.display = 'none';
        }
        
        console.log(fineTuningEnabled ? '[НАСТРОЙКА] Включена' : '[НАСТРОЙКА] Выключена');
    }
    
    // ==================== ПЕРЕКЛЮЧЕНИЕ АВТООТПРАВКИ ====================
    
    function toggleAutoSend(button) {
        if (autoSendEnabled) {
            stopAutoSend();
            if (button) {
                button.textContent = 'Автоотправка (выкл)';
                button.style.backgroundColor = '';
                button.style.color = '';
            }
        } else {
            requestNotificationPermission();
            startAutoSend();
            if (button) {
                button.textContent = 'Автоотправка (вкл)';
                button.style.backgroundColor = '#27ae60';
                button.style.color = 'white';
            }
        }
    }
    
    // ==================== ДОБАВЛЕНИЕ КНОПОК ====================
    
    function addButtons() {
        const sendRow = document.querySelector('.send-row');
        if (!sendRow) return;
        
        const infoBox = sendRow.querySelector('.info_box');
        if (infoBox) infoBox.style.display = 'none';
        
        const buttonsContainer = sendRow.querySelector('.buttons-container');
        if (!buttonsContainer) return;
        
        // Кнопка обновления войск
        if (!buttonsContainer.querySelector('.btn-refresh-troops')) {
            const refreshBtn = document.createElement('button');
            refreshBtn.type = 'button';
            refreshBtn.className = 'btn btn-default btn-refresh-troops';
            refreshBtn.textContent = 'Обновить войска';
            refreshBtn.title = 'Обновить данные о войсках';
            
            refreshBtn.addEventListener('click', async function(e) {
                e.preventDefault();
                this.disabled = true;
                await refreshTroopsData();
                this.disabled = false;
            });
            
            buttonsContainer.prepend(refreshBtn);
        }
        
        // Кнопка тонкой настройки
        if (!buttonsContainer.querySelector('.btn-fine-tuning')) {
            const fineTuningBtn = document.createElement('button');
            fineTuningBtn.type = 'button';
            fineTuningBtn.className = 'btn btn-default btn-fine-tuning';
            fineTuningBtn.textContent = fineTuningEnabled ? 'Тонкая настройка (вкл)' : 'Тонкая настройка (выкл)';
            fineTuningBtn.title = 'Вкл/Выкл тонкую настройку лимитов войск';
            
            fineTuningBtn.addEventListener('click', function(e) {
                e.preventDefault();
                toggleFineTuning(this);
            });
            
            const refreshBtn = buttonsContainer.querySelector('.btn-refresh-troops');
            if (refreshBtn) {
                refreshBtn.insertAdjacentElement('afterend', fineTuningBtn);
            } else {
                buttonsContainer.prepend(fineTuningBtn);
            }
        }
        
        // Кнопка автоотправки
        if (!buttonsContainer.querySelector('.btn-auto-send')) {
            const autoSendBtn = document.createElement('button');
            autoSendBtn.type = 'button';
            autoSendBtn.className = 'btn btn-default btn-auto-send';
            autoSendBtn.textContent = autoSendEnabled ? 'Автоотправка (вкл)' : 'Автоотправка (выкл)';
            autoSendBtn.title = 'Вкл/Выкл автоматическую отправку сборов';
            
            if (autoSendEnabled) {
                autoSendBtn.style.backgroundColor = '#27ae60';
                autoSendBtn.style.color = 'white';
            }
            
            autoSendBtn.addEventListener('click', function(e) {
                e.preventDefault();
                toggleAutoSend(this);
            });
            
            const fineTuningBtn = buttonsContainer.querySelector('.btn-fine-tuning');
            if (fineTuningBtn) {
                fineTuningBtn.insertAdjacentElement('afterend', autoSendBtn);
            } else {
                buttonsContainer.prepend(autoSendBtn);
            }
        }
        
        // Кнопка расчета
        if (!buttonsContainer.querySelector('.btn-calculate')) {
            const calculateBtn = document.createElement('button');
            calculateBtn.type = 'button';
            calculateBtn.className = 'btn btn-default btn-calculate';
            calculateBtn.textContent = 'Рассчитать';
            calculateBtn.title = 'Рассчитать оптимальное распределение войск';
            calculateBtn.style.cssText = 'margin-right: 5px;';
            
            calculateBtn.addEventListener('click', async function(e) {
                e.preventDefault();
                this.textContent = 'Расчет...';
                this.disabled = true;
                await calculateAllScavengeOptions();
                this.textContent = 'Рассчитать';
                this.disabled = false;
            });
            
            const autoSendBtn = buttonsContainer.querySelector('.btn-auto-send');
            if (autoSendBtn) {
                autoSendBtn.insertAdjacentElement('afterend', calculateBtn);
            } else {
                buttonsContainer.appendChild(calculateBtn);
            }
        }
        
        // Кнопка массовой отправки
        if (!buttonsContainer.querySelector('.btn-mass-send')) {
            const massSendBtn = document.createElement('button');
            massSendBtn.type = 'button';
            massSendBtn.className = 'btn btn-default btn-mass-send';
            massSendBtn.textContent = 'Массовая отправка';
            massSendBtn.title = 'Массовая отправка на сборы';
            massSendBtn.style.cssText = 'margin-right: 5px;';
            
            massSendBtn.addEventListener('click', async function(e) {
                e.preventDefault();
                this.textContent = 'Отправка...';
                this.disabled = true;
                await massSendScavenge();
                this.textContent = 'Массовая отправка';
                this.disabled = false;
            });
            
            const calculateBtn = buttonsContainer.querySelector('.btn-calculate');
            if (calculateBtn) {
                calculateBtn.insertAdjacentElement('afterend', massSendBtn);
            } else {
                buttonsContainer.appendChild(massSendBtn);
            }
        }
        
        // Кнопка истории
        if (!buttonsContainer.querySelector('.btn-history')) {
            const historyBtn = document.createElement('button');
            historyBtn.type = 'button';
            historyBtn.className = 'btn btn-default btn-history';
            const count = sendHistory.length;
            historyBtn.textContent = 'История (' + count + ')';
            historyBtn.title = 'Показать историю отправок';
            historyBtn.style.cssText = 'margin-right: 5px;';
            
            historyBtn.addEventListener('click', function(e) {
                e.preventDefault();
                showHistoryModal();
            });
            
            const massSendBtn = buttonsContainer.querySelector('.btn-mass-send');
            if (massSendBtn) {
                massSendBtn.insertAdjacentElement('afterend', historyBtn);
            } else {
                buttonsContainer.appendChild(historyBtn);
            }
        }
    }
    
    // ==================== ИНИЦИАЛИЗАЦИЯ ====================
    
    async function init() {
        console.log('[ИНИЦИАЛИЗАЦИЯ] Запуск скрипта v10.6...');
        console.log('[ИНИЦИАЛИЗАЦИЯ] Сервер: ' + getCurrentServer());
        console.log('[ИНИЦИАЛИЗАЦИЯ] ID текущей деревни: ' + getCurrentVillageId());
        
        detectAndInitWorld();
        
        fineTuningEnabled = loadFineTuningState();
        autoSendEnabled = loadAutoSendState();
        loadHistory();
        
        console.log('[ИНИЦИАЛИЗАЦИЯ] Тонкая настройка: ' + (fineTuningEnabled ? 'ВКЛ' : 'ВЫКЛ'));
        console.log('[ИНИЦИАЛИЗАЦИЯ] Автоотправка: ' + (autoSendEnabled ? 'ВКЛ' : 'ВЫКЛ'));
        console.log('[ИНИЦИАЛИЗАЦИЯ] История: ' + sendHistory.length + ' записей');
        
        if (autoSendEnabled) {
            requestNotificationPermission();
        }
        
        await addTroopColumnsToScavengeTable();
        addButtons();
        
        if (autoSendEnabled) {
            startAutoSend();
            const autoBtn = document.querySelector('.btn-auto-send');
            if (autoBtn) {
                autoBtn.textContent = 'Автоотправка (вкл)';
                autoBtn.style.backgroundColor = '#27ae60';
                autoBtn.style.color = 'white';
            }
        }
        
        console.log('[ИНИЦИАЛИЗАЦИЯ] Скрипт готов!');
    }
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
})();
