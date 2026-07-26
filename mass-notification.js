/**
 * TW Attack Tracker
 * Отслеживает время отправки атак в Tribal Wars
 * Поддерживает все форматы таблиц (стандартный, BB-код, русский/английский, сообщения)
 * Версия: 1.7
 */

(function() {
    'use strict';
    
    console.log('=== TW Attack Tracker v1.7 ===');
    console.log('🔄 Инициализация...');
    
    // Функция для парсинга времени из строки
    function parseAttackTime(timeText) {
        if (!timeText) return null;
        
        var patterns = [
            /(\d{2})\.(\d{2})\.(\d{2})\s+at\s+(\d{2}):(\d{2}):(\d{2})/,
            /(\d{2})\.(\d{2})\.(\d{2})\s+в\s+(\d{2}):(\d{2}):(\d{2})/,
            /(\d{2})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/
        ];
        
        for (var p = 0; p < patterns.length; p++) {
            var match = timeText.match(patterns[p]);
            if (match) {
                var dateStr = '20' + match[3] + '-' + match[2] + '-' + match[1] + 'T' + match[4] + ':' + match[5] + ':' + match[6];
                var attackTime = new Date(dateStr);
                if (!isNaN(attackTime.getTime())) {
                    return attackTime;
                }
            }
        }
        return null;
    }
    
    // Функция для поиска таблицы в сообщении
    function findAttackTable() {
        // Ищем в контейнере сообщения
        var messageContainer = document.querySelector('.message_content, .mail_content, #message_content');
        if (messageContainer) {
            var table = messageContainer.querySelector('table.vis.bbcodetable');
            if (table) return table;
            table = messageContainer.querySelector('table.vis');
            if (table) return table;
            table = messageContainer.querySelector('table.bbcodetable');
            if (table) return table;
            table = messageContainer.querySelector('table');
            if (table && table.innerHTML.indexOf('Время отправки') !== -1) return table;
            if (table && table.innerHTML.indexOf('Time of dispatch') !== -1) return table;
        }
        
        // Ищем везде на странице
        var tables = document.querySelectorAll('table.vis.bbcodetable, table.vis, table.bbcodetable');
        for (var i = 0; i < tables.length; i++) {
            var html = tables[i].innerHTML;
            if (html.indexOf('Время отправки') !== -1 || 
                html.indexOf('Time of dispatch') !== -1 ||
                html.indexOf('lВремя прибытия') !== -1) {
                return tables[i];
            }
        }
        
        // Ищем любую таблицу с атаками
        tables = document.querySelectorAll('table');
        for (var i = 0; i < tables.length; i++) {
            var html = tables[i].innerHTML;
            if ((html.indexOf('ID') !== -1 || html.indexOf('№') !== -1) &&
                (html.indexOf('Attack') !== -1 || html.indexOf('Атака') !== -1) &&
                (html.indexOf('Время отправки') !== -1 || html.indexOf('Time of dispatch') !== -1)) {
                return tables[i];
            }
        }
        
        return null;
    }
    
    // Ищем таблицу
    var table = findAttackTable();
    var tbody = table ? table.querySelector('tbody') : null;
    var textarea = document.querySelector('textarea[name="memo"]');
    var isBBCode = false;
    var timeColumnIndex = -1;
    
    if (table) {
        console.log('✅ Найдена таблица в сообщении');
        
        // Определяем индекс колонки с временем отправки
        var headers = table.querySelectorAll('th, td:first-child');
        var headerRow = table.querySelector('thead tr, tr:first-child');
        if (headerRow) {
            var cells = headerRow.querySelectorAll('th, td');
            for (var i = 0; i < cells.length; i++) {
                var text = cells[i].textContent.trim().toLowerCase();
                if (text.indexOf('время отправки') !== -1 || 
                    text.indexOf('time of dispatch') !== -1 ||
                    text.indexOf('time sent') !== -1 ||
                    text.indexOf('dispatch time') !== -1) {
                    timeColumnIndex = i;
                    console.log('✅ Найдена колонка времени отправки: индекс ' + i);
                    break;
                }
            }
        }
        
        // Если не нашли, пробуем найти по содержимому
        if (timeColumnIndex === -1 && tbody) {
            var rows = tbody.querySelectorAll('tr');
            if (rows.length > 0) {
                var firstRowCells = rows[0].querySelectorAll('td');
                for (var i = 0; i < firstRowCells.length; i++) {
                    var text = firstRowCells[i].textContent.trim();
                    if (text.match(/\d{2}\.\d{2}\.\d{2}/)) {
                        timeColumnIndex = i;
                        console.log('✅ Найдена колонка с датой: индекс ' + i);
                        break;
                    }
                }
            }
        }
        
        // По умолчанию - 5 (стандартный индекс)
        if (timeColumnIndex === -1) {
            timeColumnIndex = 5;
            console.log('⚠️ Используем стандартный индекс колонки: 5');
        }
        
        // Проверяем, не BB-код ли это
        if (tbody) {
            var firstRow = tbody.querySelector('tr');
            if (firstRow) {
                var cells = firstRow.querySelectorAll('td');
                if (cells.length > 0 && cells[0].innerHTML.indexOf('<br>') !== -1) {
                    isBBCode = true;
                    console.log('📋 Обнаружен BB-код формат таблицы');
                }
            }
        }
    } else if (textarea && textarea.value) {
        isBBCode = true;
        console.log('📋 Найдена текстовая область с BB-кодом');
        table = document.querySelector('.vis') || document.body;
        timeColumnIndex = 5;
    } else {
        alert('❌ Таблица атак не найдена!\nУбедитесь, что вы открыли письмо с атаками.');
        console.error('❌ Таблица атак не найдена!');
        return;
    }
    
    // Находим элемент с временем сервера
    var timeElem = document.querySelector('#serverTime');
    if (!timeElem) {
        alert('❌ Элемент с временем сервера не найден!');
        console.error('❌ Элемент с временем сервера не найден!');
        return;
    }
    console.log('✅ Время сервера найдено');
    
    // Ищем контейнер для вставки панели
    var contentContainer = document.querySelector('table#contentContainer');
    if (!contentContainer) {
        if (table) {
            contentContainer = table.closest('table') || table.parentNode;
        } else {
            contentContainer = document.querySelector('.message_content') || 
                             document.querySelector('.mail_content') || 
                             document.querySelector('.vis') || 
                             document.body;
        }
    }
    console.log('✅ Контейнер для панели найден');
    
    // Создаем панель статуса
    var panel = document.createElement('div');
    panel.id = 'tw-attack-tracker-panel';
    panel.style.cssText = [
        'background: linear-gradient(135deg, #f5f7fa 0%, #e8ecf1 100%)',
        'color: #333',
        'padding: 12px 20px',
        'margin: 0 0 15px 0',
        'border-radius: 8px',
        'border-left: 4px solid #4CAF50',
        'font-family: Arial, sans-serif',
        'font-size: 14px',
        'display: flex',
        'justify-content: space-between',
        'align-items: center',
        'box-shadow: 0 2px 8px rgba(0,0,0,0.08)',
        'transition: all 0.3s ease',
        'border: 1px solid #d0d7de'
    ].join(';');
    
    var notifStatus = Notification.permission === 'granted' 
        ? '🔔 Вкл' 
        : Notification.permission === 'denied' 
            ? '🔕 Откл' 
            : '⏳ Запрос';
    
    panel.innerHTML = [
        '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">',
            '<span style="font-size:20px;">⚔️</span>',
            '<span style="font-weight:bold;color:#2c3e50;">TW Attack Tracker</span>',
            '<span style="color:#b0b0b0;font-size:12px;">|</span>',
            '<span id="tracker-status" style="color:#27ae60;font-weight:500;">● Активен</span>',
            '<span style="color:#b0b0b0;font-size:12px;">|</span>',
            '<span style="color:#7f8c8d;">Ближайшая отправка:</span>',
            '<span id="tracker-next" style="color:#2c3e50;font-weight:bold;background:#ffffff;padding:2px 14px;border-radius:12px;border:1px solid #d0d7de;">Загрузка...</span>',
        '</div>',
        '<div style="display:flex;align-items:center;gap:10px;font-size:12px;flex-wrap:wrap;">',
            '<span id="tracker-count" style="color:#7f8c8d;">Атак: 0</span>',
            '<span style="color:#d0d0d0;">|</span>',
            '<span id="tracker-time" style="color:#7f8c8d;font-weight:500;">' + timeElem.textContent.trim() + '</span>',
            '<span style="color:#d0d0d0;">|</span>',
            '<span id="tracker-notif" style="color:' + (Notification.permission === 'granted' ? '#27ae60' : Notification.permission === 'denied' ? '#e74c3c' : '#f39c12') + ';font-size:11px;">' + notifStatus + '</span>',
            '<span style="color:#d0d0d0;">|</span>',
            '<span style="color:#95a5a6;font-size:11px;" id="tracker-update">обновлено: сейчас</span>',
        '</div>'
    ].join('');
    
    // Вставляем панель
    if (contentContainer && contentContainer.parentNode) {
        contentContainer.parentNode.insertBefore(panel, contentContainer);
    } else {
        document.body.insertBefore(panel, document.body.firstChild);
    }
    console.log('✅ Панель вставлена');
    
    // Запрашиваем разрешение на уведомления
    if (Notification.permission === 'default') {
        Notification.requestPermission();
    }
    
    var notified = {};
    var lastUpdate = Date.now();
    var lastClosestIndex = -1;
    
    /**
     * Поиск ближайшей атаки
     */
    function getNextAttack() {
        var closest = null;
        var closestTime = null;
        var totalAttacks = 0;
        var futureAttacks = 0;
        var closestRow = null;
        var closestId = '?';
        var closestOst = '?';
        var rows = [];
        
        if (isBBCode && textarea) {
            var lines = textarea.value.split('\n');
            var isFirst = true;
            var lineIndex = 0;
            
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i].trim();
                if (!line) continue;
                
                var parts = line.split('\t');
                if (parts.length < 8) continue;
                
                if (isFirst) {
                    isFirst = false;
                    continue;
                }
                
                totalAttacks++;
                var timeText = parts[5] || '';
                var attackTime = parseAttackTime(timeText);
                if (!attackTime) continue;
                
                var diff = attackTime.getTime() - Date.now();
                if (diff > 0) {
                    futureAttacks++;
                    if (closestTime === null || diff < closestTime) {
                        closestTime = diff;
                        closestId = parts[0] || '?';
                        closestOst = parts[parts.length - 1] || '?';
                        closestRow = i;
                        lastClosestIndex = i;
                    }
                }
                lineIndex++;
            }
            
            if (closestRow !== null) {
                closest = {
                    dataset: {
                        attackId: closestId,
                        attackOst: closestOst
                    },
                    style: { filter: '', transition: '' },
                    rowIndex: closestRow
                };
            }
        } else if (tbody) {
            rows = tbody.querySelectorAll('tr');
            for (var i = 0; i < rows.length; i++) {
                var cells = rows[i].querySelectorAll('td');
                if (cells.length < 8) continue;
                totalAttacks++;
                
                var timeText = cells[timeColumnIndex] ? cells[timeColumnIndex].textContent.trim() : '';
                if (!timeText) {
                    for (var j = 0; j < cells.length; j++) {
                        var text = cells[j].textContent.trim();
                        if (text.match(/\d{2}\.\d{2}\.\d{2}/)) {
                            timeText = text;
                            break;
                        }
                    }
                }
                
                var attackTime = parseAttackTime(timeText);
                if (!attackTime) continue;
                
                var diff = attackTime.getTime() - Date.now();
                if (diff > 0) {
                    futureAttacks++;
                    if (closestTime === null || diff < closestTime) {
                        closestTime = diff;
                        closestRow = rows[i];
                        
                        var idCell = cells[0];
                        if (idCell) {
                            closestId = idCell.textContent.trim();
                            rows[i].dataset.attackId = closestId;
                        }
                        
                        var ostCell = cells[cells.length - 1];
                        if (ostCell) {
                            closestOst = ostCell.textContent.trim();
                            rows[i].dataset.attackOst = closestOst;
                        }
                    }
                }
            }
            
            if (closestRow) {
                closest = closestRow;
            }
        }
        
        // Подсвечиваем строку
        if (!isBBCode && tbody) {
            var allRows = tbody.querySelectorAll('tr');
            for (var i = 0; i < allRows.length; i++) {
                allRows[i].style.filter = '';
                allRows[i].style.transition = 'filter 0.5s ease';
                allRows[i].style.backgroundColor = '';
            }
            
            if (closest && closest.style) {
                closest.style.filter = 'hue-rotate(45deg) brightness(1.05)';
                closest.style.transition = 'filter 0.5s ease';
                closest.style.backgroundColor = '#a8e6cf';
            }
        }
        
        // Обновляем панель
        var statusEl = document.getElementById('tracker-status');
        var nextEl = document.getElementById('tracker-next');
        var countEl = document.getElementById('tracker-count');
        var timeEl = document.getElementById('tracker-time');
        var updateEl = document.getElementById('tracker-update');
        var notifEl = document.getElementById('tracker-notif');
        
        if (notifEl) {
            var perm = Notification.permission;
            var statusText = perm === 'granted' ? '🔔 Вкл' : perm === 'denied' ? '🔕 Откл' : '⏳ Запрос';
            notifEl.textContent = statusText;
            notifEl.style.color = perm === 'granted' ? '#27ae60' : perm === 'denied' ? '#e74c3c' : '#f39c12';
        }
        
        if (timeEl && timeElem) {
            timeEl.textContent = timeElem.textContent.trim();
        }
        
        if (updateEl) {
            var seconds = Math.floor((Date.now() - lastUpdate) / 1000);
            updateEl.textContent = 'обновлено: ' + seconds + 'с назад';
        }
        
        if (countEl) {
            countEl.textContent = 'Атак: ' + futureAttacks + '/' + totalAttacks;
            countEl.style.color = futureAttacks > 0 ? '#27ae60' : '#95a5a6';
        }
        
        if (closest && closestTime !== null) {
            var minutes = Math.floor(closestTime / 60000);
            var hours = Math.floor(minutes / 60);
            var mins = minutes % 60;
            var timeStr = hours > 0 ? hours + 'ч ' + mins + 'мин' : (minutes > 0 ? mins + ' мин' : Math.floor((closestTime % 60000) / 1000) + ' сек');
            
            if (nextEl) {
                var id = closest.dataset ? closest.dataset.attackId : closestId;
                nextEl.textContent = '🎯 ID ' + (id || '?') + ' через ' + timeStr;
                nextEl.style.color = '#2c3e50';
                nextEl.style.borderColor = '#4CAF50';
                nextEl.style.background = '#e8f5e9';
                nextEl.style.fontWeight = 'bold';
            }
            
            if (statusEl) {
                statusEl.textContent = '● Активен';
                statusEl.style.color = '#27ae60';
            }
        } else {
            if (nextEl) {
                nextEl.textContent = '⏸ Нет будущих атак';
                nextEl.style.color = '#7f8c8d';
                nextEl.style.borderColor = '#e0e0e0';
                nextEl.style.background = '#f5f5f5';
            }
            if (statusEl) {
                statusEl.textContent = '● Ожидание';
                statusEl.style.color = '#f39c12';
            }
        }
        
        return { row: closest, time: closestTime };
    }
    
    function update() {
        var data = getNextAttack();
        
        if (!data || !data.row || data.time === null) return;
        
        var diff = data.time;
        if (diff <= 0 || diff > 1800000) return;
        
        var minutes = Math.floor(diff / 60000);
        var msg = '';
        var key = '';
        
        if (minutes <= 1) { msg = '1 минуту'; key = '1min'; }
        else if (minutes <= 3) { msg = '3 минуты'; key = '3min'; }
        else if (minutes <= 5) { msg = '5 минут'; key = '5min'; }
        else if (minutes <= 15) { msg = '15 минут'; key = '15min'; }
        else if (minutes <= 30) { msg = '30 минут'; key = '30min'; }
        else return;
        
        var id = data.row.dataset ? (data.row.dataset.attackId || '?') : '?';
        var ost = data.row.dataset ? (data.row.dataset.attackOst || '?') : '?';
        var notifKey = id + '_' + key;
        
        if (!notified[notifKey]) {
            notified[notifKey] = true;
            console.log('🔔 Уведомление: Отправка атаки ID ' + id + ' через ' + msg);
            
            if (Notification.permission === 'granted') {
                new Notification('⚔️ Отправка атаки через ' + msg, {
                    body: 'ID: ' + id + ', Ост: ' + ost,
                    icon: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAEJSURBVDhPY2AYBeRjgAL4VH4w/P//n+G/xBGG31K3GLmT7Bj+p/2E8Fk0GX5JG2TkBf5nZGD4DyY8xcCyz+Daf4ZBwvD//394NTx69Ihh8eLFDMnJyczXrl2DmwFE7uTkhtA///4DGRB14c+fdwwv9qWCVTHCyb9//8JpoV1hYJrhx48fDOfOnWNYtGgR3DkMDAzst2/fhpsBhAFB/f96hQw///7l+vXzE8NftRZg8HH8+vULribI1hgYGIiNjY04mJkZz86eDHKj6p8/f24Tgxl//fq1wP///yd8//79KLHGA0XH9OnTzd+9e/czuG5mwO0XnysMNh3C+X7u1x9iBfCbCeICJCaYI4kE6QAA3ePNzuvsNs0AAAAASUVORK5CYII='
                });
                console.log('✅ Уведомление отправлено');
            }
        }
    }
    
    function updateLoop() {
        update();
        setTimeout(updateLoop, 1000);
    }
    
    console.log('🔄 Запуск цикла обновления...');
    updateLoop();
    console.log('✅ Скрипт успешно запущен!');
    console.log('📌 Отслеживается ВРЕМЯ ОТПРАВКИ атак');
    console.log('💡 Уведомления приходят за 30, 15, 5, 3, 1 минуту до отправки');
    
})();
