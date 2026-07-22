/**
 * TW Attack Tracker
 * Отслеживает время отправки атак в Tribal Wars
 * Версия: 1.1
 */

(function() {
    'use strict';
    
    console.log('=== TW Attack Tracker v1.1 ===');
    console.log('🔄 Инициализация...');
    
    // Находим таблицу с атаками
    var table = document.querySelector('table.vis.bbcodetable tbody');
    if (!table) {
        alert('❌ Таблица атак не найдена!');
        console.error('❌ Таблица атак не найдена!');
        return;
    }
    console.log('✅ Таблица атак найдена');
    
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
        contentContainer = table.closest('table') || table.parentNode;
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
    
    // Определяем статус уведомлений
    var notifStatus = Notification.permission === 'granted' 
        ? '🔔 Вкл' 
        : Notification.permission === 'denied' 
            ? '🔕 Откл' 
            : '⏳ Запрос';
    
    // Заполняем панель
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
    
    // Вставляем панель на страницу
    if (contentContainer && contentContainer.parentNode) {
        contentContainer.parentNode.insertBefore(panel, contentContainer);
        console.log('✅ Панель вставлена перед contentContainer');
    } else {
        table.parentNode.insertBefore(panel, table);
        console.log('✅ Панель вставлена перед таблицей');
    }
    
    // Функция для отправки тестового уведомления
    function sendTestNotification(closestInfo) {
        if (Notification.permission === 'granted') {
            var message = '✅ Скрипт запущен!\n';
            if (closestInfo) {
                message += 'Ближайшая атака ID ' + closestInfo.id + ' через ' + closestInfo.time;
            } else {
                message += 'Нет будущих атак для отслеживания';
            }
            
            new Notification('⚔️ TW Attack Tracker', {
                body: message,
                icon: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAEJSURBVDhPY2AYBeRjgAL4VH4w/P//n+G/xBGG31K3GLmT7Bj+p/2E8Fk0GX5JG2TkBf5nZGD4DyY8xcCyz+Daf4ZBwvD//394NTx69Ihh8eLFDMnJyczXrl2DmwFE7uTkhtA///4DGRB14c+fdwwv9qWCVTHCyb9//8JpoV1hYJrhx48fDOfOnWNYtGgR3DkMDAzst2/fhpsBhAFB/f96hQw///7l+vXzE8NftRZg8HH8+vULribI1hgYGIiNjY04mJkZz86eDHKj6p8/f24Tgxl//fq1wP///yd8//79KLHGA0XH9OnTzd+9e/czuG5mwO0XnysMNh3C+X7u1x9iBfCbCeICJCaYI4kE6QAA3ePNzuvsNs0AAAAASUVORK5CYII='
            });
            console.log('✅ Тестовое уведомление отправлено');
        } else if (Notification.permission === 'default') {
            console.log('⏳ Разрешение на уведомления будет запрошено');
        } else {
            console.warn('⚠️ Уведомления запрещены, тестовое уведомление не отправлено');
        }
    }
    
    // Запрашиваем разрешение на уведомления, если нужно
    if (Notification.permission === 'default') {
        Notification.requestPermission().then(function(perm) {
            console.log('✅ Разрешение на уведомления: ' + perm);
            if (perm === 'granted') {
                // После получения разрешения отправляем тестовое уведомление
                setTimeout(function() {
                    var data = getNextAttack();
                    if (data && data.row && data.time !== null) {
                        var minutes = Math.floor(data.time / 60000);
                        var hours = Math.floor(minutes / 60);
                        var mins = minutes % 60;
                        var timeStr = hours > 0 ? hours + 'ч ' + mins + 'мин' : mins + ' мин';
                        sendTestNotification({
                            id: data.row.dataset.attackId || '?',
                            time: timeStr
                        });
                    } else {
                        sendTestNotification(null);
                    }
                }, 500);
            }
        });
    } else if (Notification.permission === 'granted') {
        console.log('✅ Уведомления разрешены');
        // Отправляем тестовое уведомление сразу после запуска
        setTimeout(function() {
            var data = getNextAttack();
            if (data && data.row && data.time !== null) {
                var minutes = Math.floor(data.time / 60000);
                var hours = Math.floor(minutes / 60);
                var mins = minutes % 60;
                var timeStr = hours > 0 ? hours + 'ч ' + mins + 'мин' : mins + ' мин';
                sendTestNotification({
                    id: data.row.dataset.attackId || '?',
                    time: timeStr
                });
            } else {
                sendTestNotification(null);
            }
        }, 500);
    } else {
        console.warn('⚠️ Уведомления запрещены в браузере');
    }
    
    // Хранилище отправленных уведомлений
    var notified = {};
    console.log('📦 Хранилище уведомлений инициализировано');
    
    // Время последнего обновления
    var lastUpdate = Date.now();
    console.log('⏱ Время последнего обновления: ' + new Date(lastUpdate).toLocaleTimeString());
    
    /**
     * Поиск ближайшей атаки по времени отправки
     */
    function getNextAttack() {
        var rows = document.querySelectorAll('table.vis.bbcodetable tbody tr');
        var closest = null;
        var closestTime = null;
        var totalAttacks = 0;
        var futureAttacks = 0;
        
        for (var i = 0; i < rows.length; i++) {
            var cells = rows[i].querySelectorAll('td');
            if (cells.length < 9) continue;
            totalAttacks++;
            
            // Берем время отправки (индекс 5)
            var timeText = cells[5].textContent.trim();
            var match = timeText.match(/(\d{2})\.(\d{2})\.(\d{2})\s+в\s+(\d{2}):(\d{2}):(\d{2})/);
            if (!match) continue;
            
            // Парсим время
            var attackTime = new Date(
                '20' + match[3] + '-' + 
                match[2] + '-' + 
                match[1] + 'T' + 
                match[4] + ':' + 
                match[5] + ':' + 
                match[6]
            );
            
            if (isNaN(attackTime.getTime())) continue;
            
            var diff = attackTime.getTime() - Date.now();
            
            // Ищем только будущие атаки
            if (diff > 0) {
                futureAttacks++;
                
                if (closestTime === null || diff < closestTime) {
                    closestTime = diff;
                    closest = rows[i];
                    
                    // Сохраняем ID атаки
                    var idCell = cells[0];
                    if (idCell) {
                        rows[i].dataset.attackId = idCell.textContent.trim();
                    }
                    
                    // Сохраняем значение Ост
                    var ostCell = cells[8];
                    if (ostCell) {
                        rows[i].dataset.attackOst = ostCell.textContent.trim();
                    }
                }
            }
        }
        
        // Обновляем элементы панели
        var statusEl = document.getElementById('tracker-status');
        var nextEl = document.getElementById('tracker-next');
        var countEl = document.getElementById('tracker-count');
        var timeEl = document.getElementById('tracker-time');
        var updateEl = document.getElementById('tracker-update');
        var notifEl = document.getElementById('tracker-notif');
        
        // Обновляем статус уведомлений
        if (notifEl) {
            var perm = Notification.permission;
            var statusText = perm === 'granted' 
                ? '🔔 Вкл' 
                : perm === 'denied' 
                    ? '🔕 Откл' 
                    : '⏳ Запрос';
            notifEl.textContent = statusText;
            notifEl.style.color = perm === 'granted' 
                ? '#27ae60' 
                : perm === 'denied' 
                    ? '#e74c3c' 
                    : '#f39c12';
        }
        
        // Обновляем время сервера
        if (timeEl && timeElem) {
            timeEl.textContent = timeElem.textContent.trim();
        }
        
        // Обновляем время последнего обновления
        if (updateEl) {
            var seconds = Math.floor((Date.now() - lastUpdate) / 1000);
            updateEl.textContent = 'обновлено: ' + seconds + 'с назад';
        }
        
        // Обновляем счетчик атак
        if (countEl) {
            countEl.textContent = 'Атак: ' + futureAttacks + '/' + totalAttacks;
            if (futureAttacks > 0) {
                countEl.style.color = '#27ae60';
            } else {
                countEl.style.color = '#95a5a6';
            }
        }
        
        // Обновляем информацию о ближайшей атаке
        if (closest && closestTime !== null) {
            var minutes = Math.floor(closestTime / 60000);
            var hours = Math.floor(minutes / 60);
            var mins = minutes % 60;
            var secs = Math.floor((closestTime % 60000) / 1000);
            
            var timeStr = '';
            if (hours > 0) {
                timeStr = hours + 'ч ' + mins + 'мин';
            } else if (minutes > 0) {
                timeStr = mins + ' мин';
            } else {
                timeStr = secs + ' сек';
            }
            
            if (nextEl) {
                nextEl.textContent = 'ID ' + closest.dataset.attackId + ' через ' + timeStr;
                nextEl.style.color = '#2c3e50';
                nextEl.style.borderColor = '#4CAF50';
                nextEl.style.background = '#e8f5e9';
            }
            
            if (statusEl) {
                statusEl.textContent = '● Активен';
                statusEl.style.color = '#27ae60';
            }
        } else {
            if (nextEl) {
                nextEl.textContent = 'Нет будущих атак';
                nextEl.style.color = '#7f8c8d';
                nextEl.style.borderColor = '#e0e0e0';
                nextEl.style.background = '#f5f5f5';
            }
            
            if (statusEl) {
                statusEl.textContent = '● Ожидание';
                statusEl.style.color = '#f39c12';
            }
        }
        
        return {
            row: closest,
            time: closestTime
        };
    }
    
    /**
     * Основная функция обновления
     */
    function update() {
        var data = getNextAttack();
        var rows = document.querySelectorAll('table.vis.bbcodetable tbody tr');
        
        // Сбрасываем подсветку со всех строк
        for (var i = 0; i < rows.length; i++) {
            rows[i].style.filter = '';
            rows[i].style.transition = 'filter 0.5s ease';
        }
        
        if (!data || !data.row) return;
        
        // Подсвечиваем строку с ближайшей атакой
        data.row.style.filter = 'hue-rotate(45deg) brightness(1.05)';
        data.row.style.transition = 'filter 0.5s ease';
        
        var diff = data.time;
        if (diff <= 0 || diff > 1800000) return; // Игнорируем атаки дальше 30 минут
        
        var minutes = Math.floor(diff / 60000);
        var msg = '';
        var key = '';
        
        // Определяем сообщение для уведомления
        if (minutes <= 1) {
            msg = '1 минуту';
            key = '1min';
        } else if (minutes <= 3) {
            msg = '3 минуты';
            key = '3min';
        } else if (minutes <= 5) {
            msg = '5 минут';
            key = '5min';
        } else if (minutes <= 15) {
            msg = '15 минут';
            key = '15min';
        } else if (minutes <= 30) {
            msg = '30 минут';
            key = '30min';
        } else {
            return;
        }
        
        var id = data.row.dataset.attackId || '?';
        var ost = data.row.dataset.attackOst || '?';
        var notifKey = id + '_' + key;
        
        // Отправляем уведомление, если еще не отправляли для этой атаки и времени
        if (!notified[notifKey]) {
            notified[notifKey] = true;
            console.log('🔔 Уведомление: Отправка атаки ID ' + id + ' через ' + msg + ', Ост: ' + ost);
            
            if (Notification.permission === 'granted') {
                new Notification('⚔️ Отправка атаки через ' + msg, {
                    body: 'ID: ' + id + ', Ост: ' + ost,
                    icon: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAEJSURBVDhPY2AYBeRjgAL4VH4w/P//n+G/xBGG31K3GLmT7Bj+p/2E8Fk0GX5JG2TkBf5nZGD4DyY8xcCyz+Daf4ZBwvD//394NTx69Ihh8eLFDMnJyczXrl2DmwFE7uTkhtA///4DGRB14c+fdwwv9qWCVTHCyb9//8JpoV1hYJrhx48fDOfOnWNYtGgR3DkMDAzst2/fhpsBhAFB/f96hQw///7l+vXzE8NftRZg8HH8+vULribI1hgYGIiNjY04mJkZz86eDHKj6p8/f24Tgxl//fq1wP///yd8//79KLHGA0XH9OnTzd+9e/czuG5mwO0XnysMNh3C+X7u1x9iBfCbCeICJCaYI4kE6QAA3ePNzuvsNs0AAAAASUVORK5CYII='
                });
                console.log('✅ Уведомление отправлено');
            } else {
                console.warn('⚠️ Уведомление не отправлено: нет разрешения');
            }
        }
    }
    
    /**
     * Цикл обновления (каждую секунду)
     */
    function updateLoop() {
        update();
        setTimeout(updateLoop, 1000);
    }
    
    console.log('🔄 Запуск цикла обновления...');
    updateLoop();
    console.log('✅ Скрипт успешно запущен!');
    console.log('📌 Отслеживается ВРЕМЯ ОТПРАВКИ атак');
    console.log('💡 Уведомления приходят за 30, 15, 5, 3, 1 минуту до отправки');
    console.log('🟢 Ближайшая атака подсвечивается зеленым оттенком');
    
})();
