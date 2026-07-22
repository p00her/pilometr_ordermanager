<?php
ini_set('session.cookie_domain', '.pilometr.ru');
@session_start();
header("Content-type: text/html; charset=utf-8");
include realpath("standalone.php");
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $data = $_GET;
} else {
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);

    if (json_last_error() !== JSON_ERROR_NONE) {
        http_response_code(400);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Invalid JSON']);
        exit;
    }
}

// ====== MAX УВЕДОМЛЕНИЯ ======
define('MAX_BOT_TOKEN', 'f9LHodD0cOLNuE8CpVmrSC6JSOICTHGZo8gHWKLDtjxxUPKBx7i6ZhyANDJy0oUn1VxR9M1ETSdoICfTCc8V');
define('MAX_CHATS_FILE', __DIR__ . '/max_chats.json');
define('MAX_NOTIFIED_FILE', __DIR__ . '/max_notified.json');

// ====== КОНЕЦ MAX ======

if ($data['key'] == '2c9cc956eedb2f75ecbbfc6b16a3b403d9d0e13f'){
$mode = $data['mode'];
$publicModes = ['login', 'checkauth', 'logout', 'register_chat', 'get_max_settings', 'update_max_settings', 'orderslist', 'auto_notify'];
if (!in_array($mode, $publicModes) && !isset($_SESSION['auth'])) {
    echo json_encode(['error' => 'auth_required']);
    exit;
}
//$mode = isset($_REQUEST['mode']) ? $_REQUEST['mode'] : null;
//ТИПЫ И ОБЪЕКТЫ

$typesCollection = umiObjectTypesCollection::getInstance();
$objectsCollection = umiObjectsCollection::getInstance();
$hierarchy = umiHierarchy::getInstance();
$emarket = cmsController::getInstance()->getModule("emarket");

//ПОЛЬЗОВАТЕЛИ
$typeId = $typesCollection->getBaseType('users', 'user');
$users = $objectsCollection->getGuidedItems($typeId);

//ОБЪЕКТЫ, ЗАКАЗ, АДРЕС
if($data['order_id']){
$order_id=$data['order_id'];
$objects = umiObjectsCollection::getInstance();
$orderObject = $objects->getObject($order_id); 
$delivery_address = $orderObject->getValue('delivery_address');
$addressObject = $objects->getObject($delivery_address);
}

//СТАТУСЫ ЗАКАЗА
$o_statuses = $objectsCollection->getGuidedItems(45);

//СТАТУСЫ ДОСТАВКИ
$d_statuses = $objectsCollection->getGuidedItems(51);

//СТАТУСЫ ОПЛАТЫ
$p_statuses = $objectsCollection->getGuidedItems(48);

//СПОСОБЫ ДОСТАВКИ
$subTypes = $typesCollection->getSubTypesList(50);
foreach($subTypes as $key_type){
$deliverys = $objectsCollection->getGuidedItems($key_type);
if (sizeof($deliverys)>0)
foreach ($deliverys as $key=>$value)
	$d_methods[$key]=$value;
}

//СПОСОБЫ ОПЛАТЫ
$subTypes = $typesCollection->getSubTypesList(47);
foreach($subTypes as $key_type){
$payments = $objectsCollection->getGuidedItems($key_type);
if (sizeof($payments)>0)
foreach ($payments as $key=>$value)
	$p_methods[$key]=$value;
}

// ====== MAX УВЕДОМЛЕНИЯ ======

/* --- Вспомогательная функция отправки сообщения в чат MAX --- */
function maxSendMessage($token, $userId, $text) {
	$payload = json_encode(array(
		'text' => $text,
		'format' => 'html',
	));
	$ch = curl_init('https://platform-api2.max.ru/messages?user_id=' . urlencode($userId));
	curl_setopt($ch, CURLOPT_POST, true);
	curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
	curl_setopt($ch, CURLOPT_HTTPHEADER, array(
		'Content-Type: application/json',
		'Authorization: ' . $token,
	));
	curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
	curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
	curl_exec($ch);
	$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
	curl_close($ch);
	return $httpCode === 200 || $httpCode === 201;
}

/* --- Настройки по умолчанию --- */
function maxDefaultSettings() {
	return array(
		'new_order' => true,
		'order_cancelled' => false,
		'delivery_ids' => array(),
	);
}

/* --- Проверка, подходит ли заказ под фильтр по способам получения --- */
function maxDeliveryMatches($orderDeliveryId, $settings) {
	$ids = isset($settings['delivery_ids']) ? $settings['delivery_ids'] : array();
	if (!is_array($ids) || empty($ids)) return true;
	return in_array($orderDeliveryId, $ids);
}

/* --- Загрузка/сохранение chats --- */
function maxLoadChats() {
	if (!file_exists(MAX_CHATS_FILE)) return array();
	$data = json_decode(file_get_contents(MAX_CHATS_FILE), true);
	return is_array($data) ? $data : array();
}

function maxSaveChats($chats) {
	file_put_contents(MAX_CHATS_FILE, json_encode($chats, JSON_UNESCAPED_UNICODE));
}

/* --- Загрузка/сохранение notified --- */
function maxLoadNotified() {
	if (!file_exists(MAX_NOTIFIED_FILE)) return array('notified' => array(), 'last_check' => 0);
	$data = json_decode(file_get_contents(MAX_NOTIFIED_FILE), true);
	if (!is_array($data)) $data = array('notified' => array(), 'last_check' => 0);
	if (!isset($data['notified'])) $data['notified'] = array();
	return $data;
}

function maxSaveNotified($data) {
	file_put_contents(MAX_NOTIFIED_FILE, json_encode($data));
}

/* --- Получение настроек по email --- */
function maxGetSettingsByEmail($chats, $email) {
	foreach ($chats as $c) {
		if ($c['email'] === $email) {
			return isset($c['settings']) ? $c['settings'] : maxDefaultSettings();
		}
	}
	return null;
}

/* --- Формирование текста сообщения о заказе --- */
function maxBuildOrderText($order, $d_methods, $p_methods = array(), $p_statuses = array()) {
	$number = $order->number;
	$price = $order->getValue('total_price');
	$poluchatel = $order->getValue('poluchatel') ?: '—';
	$mobtelefon = $order->getValue('mobtelefon') ?: '—';
	$email = $order->getValue('email') ?: '—';
	$comment = $order->getValue('comment') ?: '—';

	$deliveryId = $order->delivery_id;
	$deliveryName = 'ID ' . $deliveryId;
	$paymentId = $order->payment_id;
	$paymentName = 'ID ' . $paymentId;
	if (!empty($p_methods[$paymentId])) {
		$paymentName = $p_methods[$paymentId];
	}
	$paymentStatusId = $order->payment_status_id;
	$paymentStatusName = 'ID ' . $paymentStatusId;
	if (!empty($p_statuses[$paymentStatusId])) {
		$paymentStatusName = $p_statuses[$paymentStatusId];
	}
	if (!empty($d_methods[$deliveryId])) {
		$deliveryName = $d_methods[$deliveryId];
	}

	$text = '<b>Заказ №' . $number . '</b>';
	$text .= "\n💰 Сумма: " . number_format($price, 0, '', ' ') . ' ₽';
	$text .= "\n📦 Способ получения: " . $deliveryName;
	$text .= "\n💳 Оплата: " . $paymentName . ' (' . $paymentStatusName . ')';
	$text .= "\n👤 Получатель: " . $poluchatel;
	$text .= "\n📞 Телефон: " . $mobtelefon;
	if ($email && $email !== '—') $text .= "\n📧 E-mail: " . $email;
	if ($comment && $comment !== '—') $text .= "\n💬 Комментарий: " . $comment;

	$text .= "\n\n<b>Товары:</b>";
	$objectsCollection = umiObjectsCollection::getInstance();
	$orderItems = $order->order_items;
	if (!empty($orderItems) && is_array($orderItems)) {
		foreach ($orderItems as $oi) {
			$item = $objectsCollection->getObject($oi);
			if ($item) {
				$itemName = $item->name;
				$itemAmount = $item->item_amount ? intval($item->item_amount) : 1;
				$text .= "\n• " . $itemName . ' — ' . $itemAmount . ' шт.';
			}
		}
	}

	$text .= "\n\nОткрыть заказ: https://orders.pilometr.ru/orders/" . $order->id;
	return $text;
}



switch ($mode) {
	
		// ====== АВТОРИЗАЦИЯ ======
case 'login':
    $login = isset($_REQUEST['login']) ? $_REQUEST['login'] : '';
    $password = isset($_REQUEST['password']) ? $_REQUEST['password'] : '';
    $sel = new selector('objects');
    $sel->types('hierarchy-type')->name('users', 'user');
    $sel->where('e-mail')->equals($login);
    $user = $sel->result[0];
    if ($user && $user->getValue('password') === md5($password)) {
        $groups = $user->getValue('groups');
        $isSupervisor = false;
        if (is_array($groups)) {
            foreach ($groups as $gid) {
                $g = $objectsCollection->getObject($gid);
                if ($g && stripos($g->name, 'Супервайзеры') !== false) {
                    $isSupervisor = true;
                    break;
                }
            }
        }
        if (!$isSupervisor) {
            echo json_encode(['ok' => false, 'error' => 'Доступ только для супервайзеров']);
            break;
        }
        $_SESSION['auth'] = $user->id;
        $_SESSION['auth_name'] = $user->name;
		$_SESSION['auth_email'] = $login;   // <-- добавить
        echo json_encode(['ok' => true, 'name' => $user->name]);
    } else {
        echo json_encode(['ok' => false, 'error' => 'Неверный логин или пароль']);
    }
    break;
	case 'logout':
		session_destroy();
		echo json_encode(['ok' => true]);
		break;

	case 'checkauth':
		echo json_encode([
			'ok' => isset($_SESSION['auth']),
			'name' => isset($_SESSION['auth_name']) ? $_SESSION['auth_name'] : '',
		]);
		break;
	// ====== КОНЕЦ АВТОРИЗАЦИИ ======
	

/* --- Регистрация chat_id --- */
case 'register_chat':
	$chatId = isset($_REQUEST['chat_id']) ? $_REQUEST['chat_id'] : '';
	if (!$chatId) {
		echo json_encode(['ok' => false, 'error' => 'chat_id required']);
		break;
	}
	$email = isset($_REQUEST['email']) ? $_REQUEST['email'] : '';
	$settingsRaw = isset($_REQUEST['settings']) ? $_REQUEST['settings'] : '';

	$settings = maxDefaultSettings();
	if ($settingsRaw) {
		$parsed = json_decode($settingsRaw, true);
		if (is_array($parsed)) {
			foreach ($settings as $k => $v) {
				if (isset($parsed[$k])) {
					if (is_bool($v)) {
						$settings[$k] = $parsed[$k] ? true : false;
					} elseif (is_array($v) && is_array($parsed[$k])) {
						$settings[$k] = array();
						foreach ($parsed[$k] as $item) {
							$settings[$k][] = intval($item);
						}
					}
				}
			}
		}
	}

	$chats = maxLoadChats();
	$found = false;
	foreach ($chats as &$c) {
		if ($c['chat_id'] === $chatId) {
			if ($email) $c['email'] = $email;
			$c['settings'] = $settings;
			$found = true;
			break;
		}
	}
	unset($c);
	if (!$found) {
		$chats[] = array(
			'chat_id' => $chatId,
			'email' => $email,
			'settings' => $settings,
			'created_at' => time(),
		);
	}
	maxSaveChats($chats);
	echo json_encode(['ok' => true]);
	break;

/* --- Получить настройки текущего пользователя --- */
case 'get_max_settings':
	$email = isset($_SESSION['auth_email']) ? $_SESSION['auth_email'] : '';
	if (!$email) {
		echo json_encode(['ok' => false, 'error' => 'email not found in session']);
		break;
	}
	$chats = maxLoadChats();
	$settings = maxGetSettingsByEmail($chats, $email);
	if ($settings === null) {
		$settings = maxDefaultSettings();
		$chats[] = array('chat_id' => '', 'email' => $email, 'settings' => $settings, 'created_at' => time());
		maxSaveChats($chats);
	}
	// возвращаем также список способов получения
	$dMethods = array();
	if (isset($d_methods) && is_array($d_methods)) {
		$dMethods = $d_methods;
	}
	echo json_encode(['ok' => true, 'settings' => $settings, 'd_methods' => $dMethods]);
	break;

/* --- Обновить настройки текущего пользователя --- */
case 'update_max_settings':
	$email = isset($_SESSION['auth_email']) ? $_SESSION['auth_email'] : '';
	if (!$email) {
		echo json_encode(['ok' => false, 'error' => 'email not found in session']);
		break;
	}
	$settingsRaw = isset($_REQUEST['settings']) ? $_REQUEST['settings'] : '';
	$settings = json_decode($settingsRaw, true);
	if (!is_array($settings)) {
		echo json_encode(['ok' => false, 'error' => 'invalid settings']);
		break;
	}
	// приводим delivery_ids к числам
	if (isset($settings['delivery_ids']) && is_array($settings['delivery_ids'])) {
		$cleanIds = array();
		foreach ($settings['delivery_ids'] as $id) {
			$cleanIds[] = intval($id);
		}
		$settings['delivery_ids'] = $cleanIds;
	}
	$chats = maxLoadChats();
	$found = false;
	foreach ($chats as &$c) {
		if ($c['email'] === $email) {
			$c['settings'] = $settings;
			$found = true;
			break;
		}
	}
	unset($c);
	if (!$found) {
		$chats[] = array('chat_id' => '', 'email' => $email, 'settings' => $settings, 'created_at' => time());
	}
	maxSaveChats($chats);
	echo json_encode(['ok' => true]);
	break;

/* --- Отправить уведомление (ручная кнопка в карточке заказа) --- */
case 'send_max_notification':
    $orderId = isset($_REQUEST['order_id']) ? intval($_REQUEST['order_id']) : 0;
    if (!$orderId) { echo json_encode(['ok' => false, 'error' => 'order_id required']); break; }
    session_write_close();
    $sel = new selector('objects');
	$sel->types('hierarchy-type')->name('emarket', 'order');
	$sel->where('id')->equals($orderId);
	$order = $sel->result[0];
	if (!$order) {
		echo json_encode(['ok' => false, 'error' => 'order not found']);
		break;
	}
		$text = maxBuildOrderText($order, isset($d_methods) ? $d_methods : array(), isset($p_methods) ? $p_methods : array(), isset($p_statuses) ? $p_statuses : array());
	$token = MAX_BOT_TOKEN;
	if (!$token) {
		echo json_encode(['ok' => false, 'error' => 'bot token not configured']);
		break;
	}
	$chats = maxLoadChats();
	if (empty($chats)) {
		echo json_encode(['ok' => false, 'error' => 'no chats registered']);
		break;
	}
	$successCount = 0;
	foreach ($chats as $c) {
		if (empty($c['chat_id'])) continue;
		$settings = isset($c['settings']) ? $c['settings'] : maxDefaultSettings();
		// проверяем фильтр по способам получения
		if (!maxDeliveryMatches($order->delivery_id, $settings)) continue;
		if (maxSendMessage($token, $c['chat_id'], $text)) {
			$successCount++;
		}
	}
	echo json_encode(['ok' => $successCount > 0, 'sent' => $successCount, 'total' => count($chats)]);
	break;

/* --- Автоматическая проверка новых заказов и уведомление --- */
case 'auto_notify':
    $token = MAX_BOT_TOKEN;
    if (!$token) { echo json_encode(['ok' => false, 'error' => 'bot token not configured']); break; }
    session_write_close();
    $domainId = cmsController::getInstance()->getCurrentDomain()->getId();
	$notifiedData = maxLoadNotified();
	$notifiedIds = $notifiedData['notified'];
	$lastCheck = $notifiedData['last_check'];

	$now = time();
	$chats = maxLoadChats();
	if (empty($chats)) {
		echo json_encode(['ok' => false, 'error' => 'no chats registered']);
		break;
	}

	// ищем заказы, созданные или изменённые после last_check
	$sel = new selector('objects');
	$sel->types('hierarchy-type')->name('emarket', 'order');
	$sel->option('no-length')->value(false);
	$sel->option('load-all-props')->value(true);
	$sel->where('domain_id')->equals($domainId);
	$sel->where('status_id')->equals(array(97, 99, 100, 101, 98, 102, 95, 96));
	if ($lastCheck > 0) {
		$sel->where('order_date')->eqmore($lastCheck);
	} else {
		// первый запуск — только за последние 2 часа
		$sel->where('order_date')->eqmore(time() - 7200);
	}

	$sent = 0;
	$newNotified = $notifiedIds;

	foreach ($sel->result as $order) {
		$orderId = $order->id;
		$statusId = $order->status_id;

		// определяем тип события
		if ($statusId == 97 || $statusId == 99 || $statusId == 100 || $statusId == 101) {
			$eventType = 'new_order';
		} elseif ($statusId == 95 || $statusId == 96) {
			$eventType = 'order_cancelled';
		}

		if (!$eventType) continue;

		// проверяем, не отправляли ли уже это событие
		$alreadySent = false;
		if (isset($newNotified[$orderId]) && is_array($newNotified[$orderId])) {
			if (in_array($eventType, $newNotified[$orderId])) {
				$alreadySent = true;
			}
		}

		if ($alreadySent) continue;

		// отправляем только пользователям, у которых включён этот тип события
		// и подходит способ получения
				$text = maxBuildOrderText($order, isset($d_methods) ? $d_methods : array(), isset($p_methods) ? $p_methods : array(), isset($p_statuses) ? $p_statuses : array());

		foreach ($chats as $c) {
			if (empty($c['chat_id'])) continue;
			$settings = isset($c['settings']) ? $c['settings'] : maxDefaultSettings();
			if (empty($settings[$eventType])) continue;
			if (!maxDeliveryMatches($order->delivery_id, $settings)) continue;
			if (maxSendMessage($token, $c['chat_id'], $text)) {
				$sent++;
			}
		}

		// помечаем как отправленное
		if (!isset($newNotified[$orderId])) {
			$newNotified[$orderId] = array();
		}
		$newNotified[$orderId][] = $eventType;
	}

	maxSaveNotified(array('notified' => $newNotified, 'last_check' => $now));
	echo json_encode(['ok' => true, 'sent' => $sent, 'total' => count($chats)]);
	break;
// ====== КОНЕЦ MAX ======	
	
	
	case 'alldost':
	$domainId = cmsController::getInstance()->getCurrentDomain()->getId();
	$show_closed = 1;
			$select = new selector('objects');
			$select->types('hierarchy-type')->name('emarket', 'order');
			$select->option('no-length')->value(false);
			$select->option('load-all-props')->value(true);
			$select->limit($_REQUEST['start'],$_REQUEST['length']);
			$select->where('total_price')->notequals(0);
			$select->where('name')->isNull(false);
			$select->where('domain_id')->equals($domainId);
			$select->where('delivery_id')->equals(array(1279106));
			if($_GET['show_closed']==0){
			$select->where('status_id')->equals(array(97,99,100,101,98,4735558));
			$select->where('number')->eqmore(15500);
			}
			else {
			$select->where('status_id')->equals(array(97,99,100,101,102,98,4735558));
			$select->where('number')->eqmore(10000);
			}
//			$select->where('payment_id')->equals(array());
//			$select->where('payment_status_id')->equals(array());

			$total = $select->length; $filtred = $select->length;
					$result['recordsTotal'] =$total;
					$result['o_statuses']=$o_statuses;
					$result['p_statuses']=$p_statuses;
					$result['d_methods']=$d_methods;
					$result['p_methods']=$p_methods;
					$result['type']="FeatureCollection";
					$result['in_progress'] =0;
					$result['closed'] =0;
					$result['ready'] =0;
					
			$itemsArray = array();
			foreach($select->result as $key=>$order) {
				$order_data='';
				$item = array(
					'attribute:id' => $order->id,
					'attribute:name' => $order->name,
					'attribute:type-id' => $order->typeId,
					'attribute:guid' => $order->GUID,
					'attribute:type-guid' => $order->typeGUID,
					'attribute:ownerId' => $order->ownerId,
					'xlink:href' => $order->xlink,
				);
					$order_data['number'] = $order->number;
					if ($order->order_date !='') $order_data['order_date']=$order->order_date->getFormattedDate('d.m.Y H:i'); else $order_data['order_date']= 'Не установлена';
					if ($order->delivery_id){
					$order_data['delivery_method'] = $d_methods[$order->delivery_id];
					$order_data['r_weight'] = $order->r_weight;
					$order_data['r_volume'] = $order->r_volume;
					$order_data['poluchatel'] = $order->poluchatel;
					$order_data['mobtelefon'] = $order->mobtelefon;
					$order_data['delivery_price'] = $order->delivery_price;
					if (null!==$order->getValue('delivery_aw_date')) $order_data['delivery_aw_date'] = $order->delivery_aw_date->getFormattedDate('d.m.Y H:i'); else $order_data['delivery_aw_date'] = "Не назначена";
					}
					foreach($order->order_items as $orderItem){
					$item = $objectsCollection->getObject($orderItem);
					$item_page= $item->item_link;
					$page = $hierarchy->getElement($item_page[0]->id); 
					if (!empty($orderItem)){
						$it['name']=$item->name;
						$it['amount']=$item->item_amount;
						$it['price']=$item->item_price;
						$it['id']=(int)$orderItem;
						$it['volume']=$page->getValue('volume');
						$it['width']=$page->getValue('shirina');
						$it['height']=$page->getValue('tolshchina_mm');
						$it['length']=$page->getValue('dlina');
						$it['weight']=$page->getValue('weight');
						if($page) $it['bar_code']=$page->getValue('bar_code');
						if($page) $it['artikul']=$page->getValue('artikul');
						$order_data['items'][] = $it;
					}
					}
					
					$order_data['price']=$order->getValue('total_price');

					if ($order->delivery_address)
					{
						$address_object = $objectsCollection->getObject($order->delivery_address);

						$order_data['address']=$address_object->getValue('adres');
						$order_data['comment']=$address_object->getValue('comment');
						$order_data['finish_point']=$address_object->getValue('point_coords');
						$order_data['start_point']=$address_object->getValue('start_point');
					}
					if ($order->status_id)
					{

						$order_data['order_status']=$o_statuses[$order->status_id];
					}
					else $order_data['order_status'] = 'Не установлен';

					if($order->payment_status_id)
					{
						$order_data['payment_status']=$p_statuses[$order->payment_status_id];
					}
					else $order_data['payment_status'] = "Не установлен";
					
					if($order->payment_status_id) $order_data['payment_method'] = $p_methods[$order->payment_id]; else $order_data['payment_method'] = "Не выбран";
					$order_data['id'] = $order->id;
					
					$feature['type']= "Feature";
					$feature['id']= $key;
					if ($order_data['delivery_aw_date'] !='Не назначена') $feature['properties']['iconCaption']= date('d.m.Y', strtotime($order_data['delivery_aw_date'])); else $feature['properties']['iconCaption'] = '';
					$feature['geometry']['type'] = "Point";
					$feature['geometry']['coordinates']= explode(',',$order_data['finish_point']);
					$feature['properties']['balloonContentHeader'] = $order->name." от ".$order_data['order_date'];
					$feature['properties']['balloonContentBody'] = "<span style='font-size:small'>".$order_data['address']."</span><br>".$order_data['poluchatel'].", Тел.:".$order_data['mobtelefon']."";
					$feature['properties']['balloonContentFooter']= "Дата доставки: ".$order_data['delivery_aw_date'].". Объем: ".$order_data['r_volume']." м<sup>3</sup>, Вес: ".$order_data['r_weight']." кг.<br>".$order_data['comment'];
					$feature['properties']['clusterCaption'] = $order->name;
					$feature['properties']['hintContent'] = "Дата доставки: ".$order_data['delivery_aw_date'].". Объем: ".$order_data['r_volume']." м<sup>3</sup>, Вес: ".$order_data['r_weight']." кг.";
					if ($order->status_id == 98) { $result['in_progress']+=1; $feature['options']['preset'] = 'islands#blueStretchyIcon'; $feature['status']='in_progress';}
					elseif($order->status_id == 99) { $result['closed']+=1; $feature['options']['preset'] = 'islands#orangeStretchyIcon'; $feature['status']='in_progress';}
					elseif($order->status_id == 97) { $result['closed']+=1; $feature['options']['preset'] = 'islands#oliveStretchyIcon'; $feature['status']='in_progress';}
					elseif($order->status_id == 4735558) { $result['closed']+=1; $feature['options']['preset'] = 'islands#redStretchyIcon'; $feature['status']='in_progress';}
					elseif($order->status_id == 102) { $result['closed']+=1; $feature['options']['preset'] = 'islands#grayCircleDotIcon'; $feature['status']='closed';}
					else {$result['ready']+=1; $feature['options']['preset'] = 'islands#greenStretchyIcon'; $feature['status']='in_progress'; $feature['status']='waiting';}
					if($order->status_id != 4735558)
					$feature['properties']['iconContent'] = '<span style="font-size:x-small; color:grey;">#'.$order->number.'</span> <span style="font-size:12px; color:black;">'.$order_data['delivery_aw_date'].'</span>';
					else
					$feature['properties']['iconContent'] = '<span style="font-size:x-small; color:red;">АРЕЛАН</span> <span style="font-size:12px; color:red;">'.$order_data['delivery_aw_date'].'</span>';
					$result['features'][]=$feature;
					//$result['data'][]=$order_data;

			}
			if ($total==0) $result['data']='';
			echo json_encode($result, JSON_UNESCAPED_UNICODE);
	break;
	
case 'getstat':
	$domainId = cmsController::getInstance()->getCurrentDomain()->getId();
	$select = new selector('objects');
	$select->types('hierarchy-type')->name('emarket', 'order');
	$select->option('no-length')->value(false);
	$select->option('load-all-props')->value(true);
	$select->limit($_REQUEST['start'],$_REQUEST['length']);
	$select->where('total_price')->notequals(0);
	$select->where('name')->isNull(false);
	$select->where('domain_id')->equals($domainId);
	$select->where('number')->eqmore(4241);
	$select->where('status_id')->equals(array(97,99,100,101,98,102,95,96));

	$select->where('order_date')->eqmore(strtotime($_REQUEST['date_from']));
	$select->where('order_date')->eqless(strtotime($_REQUEST['date_to'].' 23:59'));

	$result['recordsTotal'] = $select->length;
	$result['d_methods'] = $d_methods;

	$initGroup = array(
		'total'=>0,
		'total_order_price'=>0,
		'total_weight'=>0,
		'total_volume'=>0,
	);

	$result['by_delivery'] = array();
	$result['total'] = $initGroup;

	foreach($select->result as $order) {
		$deliveryKey = $order->delivery_id ? (string)$order->delivery_id : '0';
		if (!isset($result['by_delivery'][$deliveryKey])) {
			$result['by_delivery'][$deliveryKey] = $initGroup;
		}

		$price = $order->getValue('total_price');
		$weight = $order->r_weight ?: 0;
		$volume = $order->r_volume ?: 0;

		if ($order->status_id == 97 || $order->status_id == 99) {
			$group = 'in_progress';
		} elseif ($order->status_id == 100 || $order->status_id == 101) {
			$group = 'ready';
		} elseif ($order->status_id == 98 || $order->status_id == 102) {
			$group = 'closed';
		} elseif ($order->status_id == 95 || $order->status_id == 96) {
			$group = 'cancelled';
		} else {
			continue;
		}

		if (!isset($result['by_delivery'][$deliveryKey][$group])) {
			$result['by_delivery'][$deliveryKey][$group] = $initGroup;
		}
		if (!isset($result['total'][$group])) {
			$result['total'][$group] = $initGroup;
		}

		$result['by_delivery'][$deliveryKey][$group]['total'] += 1;
		$result['by_delivery'][$deliveryKey][$group]['total_order_price'] += $price;
		$result['by_delivery'][$deliveryKey][$group]['total_weight'] += $weight;
		$result['by_delivery'][$deliveryKey][$group]['total_volume'] += $volume;

		$result['total'][$group]['total'] += 1;
		$result['total'][$group]['total_order_price'] += $price;
		$result['total'][$group]['total_weight'] += $weight;
		$result['total'][$group]['total_volume'] += $volume;

		$result['by_delivery'][$deliveryKey]['total'] += 1;
		$result['by_delivery'][$deliveryKey]['total_order_price'] += $price;
		$result['by_delivery'][$deliveryKey]['total_weight'] += $weight;
		$result['by_delivery'][$deliveryKey]['total_volume'] += $volume;

		$result['total']['total'] += 1;
		$result['total']['total_order_price'] += $price;
		$result['total']['total_weight'] += $weight;
		$result['total']['total_volume'] += $volume;
	}

	echo json_encode($result, JSON_UNESCAPED_UNICODE);
	break;


	
	case 'getcatalogitem':
	$select = new selector('objects');
	$select->types('hierarchy-type')->name('catalog', 'object');
	$select->option('no-length')->value(false);
	$select->option('load-all-props')->value(true);
	$select->where('bar_code')->equals($_REQUEST['barcode']);
	$obj = $select->result[0];
	$response['name'] = $obj->name;
	$response['item_id'] = $obj->id;
	$selPage = new selector('pages');
	$selPage->types('hierarchy-type')->name('catalog', 'object');
	$selPage->where('object_id')->equals($obj->id);
	$page = $selPage->result[0];

	echo json_encode($response, JSON_UNESCAPED_UNICODE);
	break;
// для отправки в магазины
	case 'getallnames4statuses':
		
		$statusesdata = array(
		'o_statuses' =>$o_statuses,
		'd_methods' => $d_methods,
		'd_statuses' => $d_statuses,
		'p_methods' => $p_methods,
		'p_statuses' => $p_statuses,);
		
		echo json_encode($statusesdata, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
	break;
	
	case 'getdata':
	    //$delivery_aw_date_object = $orderObject->getValue('delivery_aw_date');
		//$delivery_aw_date = '';
		/*if ($delivery_aw_date_object !=''){
		$delivery_aw_timestamp = $delivery_aw_date_object->timestamp;
		$delivery_aw_date = strftime('%d.%m.%Y %H:%M',$delivery_aw_timestamp);
		}*/
		$orderdata = array(
		'number' => $orderObject->getValue('number'),
		'status_id' => $orderObject->getValue('status_id'),
		'payment_id' => $orderObject->getValue('payment_id'),
		'payment_status_id' => $orderObject->getValue('payment_status_id'),
		'delivery_id' => $orderObject->getValue('delivery_id'),
		//'delivery_status_id' => $orderObject->getValue('delivery_status_id'),
		//'adres' => $addressObject->getValue('adres'),
		//'delivery_aw_date' => $delivery_aw_date,
		//'delivery_price' => $orderObject->getValue('delivery_price'),
		//'r_weight' => $orderObject->getValue('r_weight'),
		//'r_volume' => $orderObject->getValue('r_volume'),
		'poluchatel' => $orderObject->getValue('poluchatel'),
		'mobtelefon' => $orderObject->getValue('mobtelefon'),
		'e-mail' => $orderObject->getValue('email'),
		'comment' => $addressObject->getValue('comment'),
		'status_change_date' => $orderObject->getValue('status_change_date') ? date('d.m.Y H:i', $orderObject->getValue('status_change_date')) : '',
		//'point_coords' => $addressObject->getValue('point_coords'),
		//'start_point' => $addressObject->getValue('start_point'),
		//'maxlength' => $orderObject->getValue('maxlength'),
		//'maxwidth' => $orderObject->getValue('maxwidth'),
		//'maxheight' => $orderObject->getValue('maxheight'),
		//'quantity' => $orderObject->getValue('quantity'),
		//'maxweight' => $orderObject->getValue('maxweight')
		);

		foreach($orderObject->order_items as $orderItem){
			$item = $objectsCollection->getObject($orderItem);
			$item_page= $item->item_link;
			$page = $hierarchy->getElement($item_page[0]->id); 
			if (!empty($orderItem)){
				$it['name']=$item->name;
				$it['amount']=$item->item_amount;
				$it['price']=$item->item_price;
				$it['id']=(int)$orderItem;
				$it['volume']=$page->getValue('volume');
				$it['width']=$page->getValue('shirina');
				$it['height']=$page->getValue('tolshchina_mm');
				$it['length']=$page->getValue('dlina');
				$it['weight']=$page->getValue('weight');
				$it['volhov_storage']=$page->getValue('volhov_storage');
				$it['lomonosov_storage']=$page->getValue('lomonosov_storage');
				$it['roshino_storage']=$page->getValue('roshino_storage');
				$it['skotnoe_storage']=$page->getValue('skotnoe_storage');
				$it['ladoga_storage']=$page->getValue('ladoga_storage');
				if($page) $it['bar_code']=$page->getValue('bar_code');
				if($page) $it['artikul']=$page->getValue('artikul');
				$orderdata['items'][] = $it;
			}
			}
		echo json_encode($orderdata, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
	break;
case 'getitemstorage':
	session_write_close();
    $itemIds = $_REQUEST['item_ids'];
    if (empty($itemIds) || !is_array($itemIds)) {
        echo json_encode([]);
        break;
    }
    $pageIds = array();
    $itemMap = array();
    foreach($itemIds as $orderItemId){
        $item = $objectsCollection->getObject($orderItemId);
        if ($item) {
            $item_page = $item->item_link;
            if (!empty($item_page) && isset($item_page[0])) {
                $pid = $item_page[0]->id;
                $pageIds[] = $pid;
                $itemMap[(int)$orderItemId] = $pid;
            }
        }
    }
    $pages = array();
    if (!empty($pageIds)) {
        $sel = new selector('pages');
        $sel->where('id')->equals(array_values(array_unique($pageIds)));
        foreach ($sel->result as $page) {
            $pages[$page->id] = $page;
        }
    }
    $items = array();
    foreach($itemIds as $orderItemId){
        $id = (int)$orderItemId;
        $pid = isset($itemMap[$id]) ? $itemMap[$id] : null;
        $page = $pid && isset($pages[$pid]) ? $pages[$pid] : null;
        if ($page) {
            $items[] = array(
                'id' => $id,
                'volhov_storage' => $page->getValue('volhov_storage'),
                'lomonosov_storage' => $page->getValue('lomonosov_storage'),
                'roshino_storage' => $page->getValue('roshino_storage'),
                'skotnoe_storage' => $page->getValue('skotnoe_storage'),
                'ladoga_storage' => $page->getValue('ladoga_storage'),
            );
        }
    }
    echo json_encode($items, JSON_UNESCAPED_UNICODE);
    break;
	
	case 'setstatus':
	$oldStatusId = $orderObject->getValue('status_id');
		$newStatusId = $data['status_id'];
		$order=order::get($order_id);

		if($oldStatusId != $newStatusId) {
		$order->setOrderStatus($newStatusId);
		}
		
		$order->refresh();
		$order->commit();
		
		echo json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
		
	break;

	case 'getneworders':
	
			$domainId = cmsController::getInstance()->getCurrentDomain()->getId();
			$select = new selector('objects');
			$select->types('hierarchy-type')->name('emarket', 'order');
			$select->option('no-length')->value(false);
			$select->option('load-all-props')->value(true);
			$select->where('total_price')->notequals(0);
			$select->where('name')->isNull(false);
			$select->where('number')->eqmore(20000);
			$select->where('retail_export')->isNull(false);
			$order_c = 'id';

			$select->order($order_c)->asc();
			
			$total = $select->length;
			$result['recordsTotal'] =$total;

					
			$itemsArray = array();
			foreach($select->result as $order) {
				$order_data='';
				$item = array(
					'attribute:id' => $order->id,
					'attribute:name' => $order->name,
					'attribute:type-id' => $order->typeId,
					'attribute:guid' => $order->GUID,
					'attribute:type-guid' => $order->typeGUID,
					'attribute:ownerId' => $order->ownerId,
					'xlink:href' => $order->xlink,
				);
					$order_data['number'] = $order->number;
					if ($order->order_date !='') $order_data['order_date']=$order->order_date->getFormattedDate('d.m.Y H:i'); else $order_data['order_date']= 0;
					if ($order->delivery_id){
					$order_data['delivery_method'] = $order->delivery_id;
					$order_data['r_weight'] = $order->r_weight;
					$order_data['r_volume'] = $order->r_volume;
					$order_data['poluchatel'] = $order->poluchatel;
					$order_data['mobtelefon'] = $order->mobtelefon;
					$order_data['delivery_price'] = $order->delivery_price;
					if (null!==$order->getValue('delivery_aw_date')) $order_data['delivery_aw_date'] = $order->delivery_aw_date->getFormattedDate('d.m.Y H:i'); else $order_data['delivery_aw_date'] = 0;
					}
					foreach($order->order_items as $orderItem){
					$item = $objectsCollection->getObject($orderItem);
					$item_page= $item->item_link;
					$page = $hierarchy->getElement($item_page[0]->id); 
					if (!empty($orderItem)){
						$it['name']=$item->name;
						$it['amount']=$item->item_amount;
						$it['price']=$item->item_price;
						if($page) $it['bar_code']=$page->getValue('bar_code');
						if($page) $it['artikul']=$page->getValue('artikul');
						$order_data['items'][] = $it;
					}
					}
					
					$order_data['price']=$order->getValue('total_price');

					if ($order->delivery_address)
					{
						$address_object = $objectsCollection->getObject($order->delivery_address);
						//$order_data['address']=$address_object->getValue('adres');
						$order_data['comment']=$address_object->getValue('comment');
						//$order_data['finish_point']=$address_object->getValue('point_coords');
						//$order_data['start_point']=$address_object->getValue('start_point');
					}
					
					
					
					if ($order->status_id)
					{

						$order_data['order_status']=$order->status_id;
					}
					else $order_data['order_status'] = 0;

					if ($order->delivery_status_id)
					{

						$order_data['delivery_status']=$order->delivery_status_id;
					}
					else $order_data['delivery_status'] = 0;

					if($order->payment_status_id)
					{
						$order_data['payment_status']=$order->payment_status_id;
					}
					else $order_data['payment_status'] = 0;
					
					if($order->payment_status_id) $order_data['payment_method'] = $p_methods[$order->payment_id]; else $order_data['payment_method'] = 0;
					$order_data['id'] = $order->id;
					$result['data'][]=$order_data;

			}
			if ($total==0) $result['data']='';
			echo json_encode($result, JSON_UNESCAPED_UNICODE,JSON_PRETTY_PRINT);
			
	break;
	
	case 'setexported':
	if (!isset($data['order_id'])) {echo 'Error: order_id is not set'; exit;} else {
		$order=order::get($order_id);
		$orderObject->setValue('retail_export', 0);
		$order->refresh();
		$order->commit();
		echo json_encode($order->retail_export, JSON_UNESCAPED_UNICODE,JSON_PRETTY_PRINT);
}
	break;
	
	case 'getorderitems':
		$items='';
		echo '<table style="width:100%"><thead><th>Название</th><th>Кол-во</th><th>Удалить</th></thead><tbody>';
		foreach($orderObject->order_items as $orderItem){
		$item = $objectsCollection->getObject($orderItem);
		$item_page= $item->item_link;
		$page = $hierarchy->getElement($item_page[0]->id);
		if (!empty($orderItem)){
			echo '<tr><td>'.$item->name.'</td><td><input style="width:35px" class="amount" data-object_id="'.$page->getObjectId().'" data-id="'.$item->id.'" value="'.$item->item_amount.'"></td><td><button style="width:35px" class="remove" data-id="'.$item->id.'">Удалить</button></td></tr>';
			//echo '<pre>'; print_r($page); echo '</pre>';
		}
		}
		echo '</tbody></table><button id="additems">Добавить товары</button><button id="saveitems">Сохранить товары</button>';
	//echo json_encode($items, JSON_UNESCAPED_UNICODE);
	break;
	
	case 'removeitem':
	$item_id = $_REQUEST['item_id'];
	$order=order::get($order_id);
	$item=$order->getItem($item_id);
	$order->removeItem($item);
	$order->refresh();
	break;
	
	case 'setamount':
	foreach ($_REQUEST['items'] as $item){
		$orderitem=orderItem::get($item['id']);
		if($item['value'] != $orderitem->getAmount()) {
		$orderitem->setAmount($item['value']);
		$orderitem->refresh();
		}
	}
	$order=order::get($order_id);
	$order->refresh();
	break;
	
	case 'appenditems':
	$order=order::get($order_id);
	$orderitems=$order->getItems();
	foreach ($_REQUEST['append_items'] as $appenditem){
		$check=0;
		$add_pages = $hierarchy->getObjectInstances($appenditem['add_id']);
		foreach($orderitems as $orderitem){
		$item_page = $orderitem->item_link;
		$page = $hierarchy->getElement($item_page[0]->id);
		$object_id = $page->getObjectId();
		if ($appenditem['add_id']==$object_id){
			$oldamount= $orderitem->getAmount();
			$newamount=$oldamount+$appenditem['add_amount'];
			$orderitem->setAmount($newamount);
			$check=1;
		}

		}
		if ($check==0) {
		$tOrderItem = orderItem::create($add_pages[0]);
		$tOrderItem->setAmount($appenditem['add_amount']);
		$order->appendItem($tOrderItem);
		print_r($add_pages);
		}
	}
	$order->refresh();
	break;
	
	case 'putdata':
	
		$addressObject->setValue('adres', $_REQUEST['adres']);
		$addressObject->setValue('comment', $_REQUEST['comment']);
		$addressObject->setValue('point_coords', $_REQUEST['point_coords']);
		$addressObject->setValue('start_point', $_REQUEST['start_point']);
		
		$oldStatusId = $orderObject->getValue('status_id');
		$newStatusId = $_REQUEST['status_id'];
		$order=order::get($order_id);

		if($oldStatusId != $newStatusId) {
		//$orderObject->setValue('status_id', $_REQUEST['status_id']);
		$order->setOrderStatus($newStatusId);
		}

		$orderObject->setValue('payment_id', $_REQUEST['payment_id']);
		$orderObject->setValue('payment_status_id', $_REQUEST['payment_status_id']);
		$orderObject->setValue('delivery_id', $_REQUEST['delivery_id']);
		$orderObject->setValue('delivery_status_id', $_REQUEST['delivery_status_id']);
		$orderObject->setValue('delivery_aw_date', strtotime($_REQUEST['delivery_aw_date']));
		$orderObject->setValue('delivery_price', $_REQUEST['delivery_price']);
		$orderObject->setValue('r_weight', $_REQUEST['r_weight']);
		$orderObject->setValue('r_volume', $_REQUEST['r_volume']);
		$orderObject->setValue('poluchatel', $_REQUEST['poluchatel']);
		$orderObject->setValue('mobtelefon', $_REQUEST['mobtelefon']);
		$orderObject->setValue('e-mail', $_REQUEST['email']);
		
		$orderObject->setValue('maxlength', $_REQUEST['maxlength']);
		$orderObject->setValue('maxwidth', $_REQUEST['maxwidth']);
		$orderObject->setValue('maxheight', $_REQUEST['maxheight']);
		$orderObject->setValue('maxweight', $_REQUEST['maxweight']);
		$orderObject->setValue('quantity', $_REQUEST['quantity']);
		
		$addressObject->commit();
		$order->refresh();
		$order->commit();
		echo json_encode($_REQUEST, JSON_UNESCAPED_UNICODE);
	break;
	
	case 'orderslist':
			$domainId = cmsController::getInstance()->getCurrentDomain()->getId();
			$select = new selector('objects');
			$select->types('hierarchy-type')->name('emarket', 'order');
			$select->option('no-length')->value(false);
			$select->option('load-all-props')->value(true);
			$select->limit($_REQUEST['start'],$_REQUEST['length']);
			$select->where('total_price')->notequals(0);
			$select->where('name')->isNull(false);
			$select->where('domain_id')->equals($domainId);
			$select->where('number')->eqmore(19300);
			if (isset($_REQUEST['modified_since']) && $_REQUEST['modified_since'] != '') {
			$select->where('status_change_date')->eqmore(strtotime($_REQUEST['modified_since']));
			}
			//$select->where('delivery_status_id')->equals(array($_REQUEST[columns][4][search][value]));
			//$select->where('delivery_id')->equals(array($_REQUEST[columns][5][search][value]));
			//$select->where('status_id')->equals($_REQUEST[columns][6][search][value]);
			//$select->where('payment_id')->equals(array($_REQUEST[columns][7][search][value]));
			//$select->where('payment_status_id')->equals($_REQUEST[columns][8][search][value]);


			$order_c = 'id';

			$select->order($order_c)->asc();
			
			$total = $select->length; $filtred = $select->length;
					$result['recordsTotal'] =$total;
					$result['recordsFiltered'] = $filtred;
					$result['draw'] = $_REQUEST['draw'];
					$result['o_statuses']=$o_statuses;
					$result['p_statuses']=$p_statuses;
					$result['d_statuses']=$d_statuses;
					$result['d_methods']=$d_methods;
					$result['p_methods']=$p_methods;

					
			$itemsArray = array();
			foreach($select->result as $order) {
				$order_data='';
				$item = array(
					'attribute:id' => $order->id,
					'attribute:name' => $order->name,
					'attribute:type-id' => $order->typeId,
					'attribute:guid' => $order->GUID,
					'attribute:type-guid' => $order->typeGUID,
					'attribute:ownerId' => $order->ownerId,
					'xlink:href' => $order->xlink,
				);
					$order_data['number'] = $order->number;
					if ($order->order_date !='') $order_data['order_date']=$order->order_date->getFormattedDate('d.m.Y H:i'); else $order_data['order_date']= 'Не установлена';
					if ($order->delivery_id){
					$order_data['delivery_method'] = $d_methods[$order->delivery_id];
					$order_data['r_weight'] = $order->r_weight;
					$order_data['r_volume'] = $order->r_volume;
					$order_data['poluchatel'] = $order->poluchatel;
					$order_data['mobtelefon'] = $order->mobtelefon;
					$order_data['email'] = $order->{"e-mail"};
					$order_data['delivery_price'] = $order->delivery_price;
					if (null!==$order->getValue('delivery_aw_date')) $order_data['delivery_aw_date'] = $order->delivery_aw_date->getFormattedDate('d.m.Y H:i'); else $order_data['delivery_aw_date'] = "Не назначена";
					}
					foreach($order->order_items as $orderItem){
					$item = $objectsCollection->getObject($orderItem);
					$item_page= $item->item_link;
					$page = $hierarchy->getElement($item_page[0]->id); 
					if (!empty($orderItem)){
						$it['name']=$item->name;
						$it['amount']=$item->item_amount;
						$it['price']=$item->item_price;
						$it['id']=(int)$orderItem;
						if($page) $it['bar_code']=$page->getValue('bar_code');
						if($page) $it['artikul']=$page->getValue('artikul');
						if($page) $it['weight']=$page->getValue('weight');
						if($page) $it['volume']=$page->getValue('volume');

						$order_data['items'][] = $it;
						
					}
					}
					
					$order_data['price']=$order->getValue('total_price');

					if ($order->delivery_address)
					{
						$address_object = $objectsCollection->getObject($order->delivery_address);

						$order_data['address']=$address_object->getValue('adres');
						$order_data['comment']=$address_object->getValue('comment');
						$order_data['finish_point']=$address_object->getValue('point_coords');
						$order_data['start_point']=$address_object->getValue('start_point');
					}
					
					
					
					if ($order->status_id)
					{

						$order_data['order_status']=$o_statuses[$order->status_id];
					}
					else $order_data['order_status'] = 'Не установлен';

					if ($order->delivery_status_id)
					{

						$order_data['delivery_status']=$d_statuses[$order->delivery_status_id];
					}
					else $order_data['delivery_status'] = 'Не установлен';


					if($order->payment_status_id)
					{
						$order_data['payment_status']=$p_statuses[$order->payment_status_id];
					}
					else $order_data['payment_status'] = "Не установлен";
					
					if($order->payment_status_id) $order_data['payment_method'] = $p_methods[$order->payment_id]; else $order_data['payment_method'] = "Не выбран";
					
					$order_data['status_id'] = $order->status_id;
$order_data['delivery_id'] = $order->delivery_id;
$order_data['payment_id'] = $order->payment_id;
$order_data['payment_status_id'] = $order->payment_status_id;
					$order_data['id'] = $order->id;
					
					$result['data'][]=$order_data;

			}
			if ($total==0) $result['data']='';
			echo json_encode($result, JSON_UNESCAPED_UNICODE,JSON_PRETTY_PRINT);
	break;
		}
}
?>