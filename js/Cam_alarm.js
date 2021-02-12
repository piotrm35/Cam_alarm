//***************************************************************************
//  Cam_alarm.js
//
//  A piece of software that watches a region of cam view and raises alarm when a change occurs.
//  --------------------------------------
//  Date : 06.02.2021
//  Copyright: (C) 2021 by Piotr Michałowski
//  Email: piotrm35@hotmail.com
//***************************************************************************
// *
// * This program is free software; you can redistribute it and/or modify
// * it under the terms of the GNU General Public License version 3 as published
// * by the Free Software Foundation.
// *
// ***************************************************************************/

const APP_NAME = 'Cam_alarm v. 2.0';

const VIDEO_RES = {'width':640, 'height':480};
const FPS = 30;
const TEMPLATE_CANVAS_MAX_WIDTH = 180;
const TEMPLATE_CANVAS_MAX_HEIGHT = 180;
const STOP_WATCHING_TEXT = 'stop watching';
const RESTORE_WATCHING_TEXT = 'restore watching';
const ALARM_SOUND = new Audio('./sound/alarm_beep.mp3');
let rectangle = {'left':0, 'top':0, 'width':0, 'height':0};
let template = null;
let mask_img = null;
let clear_template_request = false;
let alarm = false;
let mouse_down = false;


function init()
{
	document.getElementById('top_panel').innerHTML = APP_NAME;
	let video_input = document.getElementById('video_input');
	let main_canvas = document.getElementById('main_canvas');
	main_canvas.width = VIDEO_RES.width;
	main_canvas.height = VIDEO_RES.height;
	let main_ctx = main_canvas.getContext('2d');
	let template_canvas = document.getElementById('template_canvas');
	let template_ctx = template_canvas.getContext('2d');
	let roi_canvas = document.getElementById('roi_canvas');
	let roi_ctx = roi_canvas.getContext('2d');
	let mask_canvas = document.getElementById('mask_canvas');
	let mask_ctx = mask_canvas.getContext('2d');
	let roi_margin = document.getElementById('roi_margin');
	let alarm_threshold = document.getElementById('alarm_threshold');
	let stop_and_restore_watching_button = document.getElementById('stop_and_restore_watching_button');
	
	
	stop_and_restore_watching_button.innerText = STOP_WATCHING_TEXT;
	
	navigator.mediaDevices.getUserMedia({video: VIDEO_RES, audio: false})
		.then(function(stream) {
				video_input.srcObject = stream;
				video_input.addEventListener('play', process_video(video_input, main_canvas, main_ctx, template_canvas, template_ctx, roi_canvas, roi_ctx, roi_margin, alarm_threshold, mask_canvas, mask_ctx, stop_and_restore_watching_button));
				setTimeout(function() {
						document.getElementById('bottom_panel').innerHTML = 'resolution: ' + video_input.videoWidth + 'x' +  video_input.videoHeight;
					}, 1000);
				init_rectangle_drawing(video_input, main_canvas, main_ctx, template_canvas, template_ctx, mask_canvas, mask_ctx);
				init_mask_drawing(mask_canvas, mask_ctx);
			})
		.catch(function(err) {
				console.log('init ERROR: ' + err.name + ' ' + err.message);
			});
}

function process_video(video_input, main_canvas, main_ctx, template_canvas, template_ctx, roi_canvas, roi_ctx, roi_margin, alarm_threshold, mask_canvas, mask_ctx, stop_and_restore_watching_button)
{
	let color_ind = false;
	let fps_frames_no = 0;
	let fps_begin = Date.now();
	(function process_video_loop()
	 {
		let begin = Date.now();
		if (clear_template_request)
		{
			template = null;
			mask_img = null;
			set_canvas_size(template_canvas, TEMPLATE_CANVAS_MAX_WIDTH, TEMPLATE_CANVAS_MAX_HEIGHT);
			document.getElementById('aux_content').style.width = TEMPLATE_CANVAS_MAX_WIDTH + 'px';
			template_ctx.clearRect(0, 0, template_canvas.width, template_canvas.height);
			mask_ctx.clearRect(0, 0, mask_canvas.width, mask_canvas.height);
			main_ctx.clearRect(0, 0, main_canvas.width, main_canvas.height);
			document.getElementById('similarity_panel').innerHTML = '';
			clear_template_request = false;
		}
		if (template && !mouse_down && rectangle.width > 0 && rectangle.height > 0)
		{
			main_ctx.clearRect(0, 0, main_canvas.width, main_canvas.height);
			try
			{
				let roi_m = parseInt(roi_margin.value, 10);
				roi_m = roi_m > 0 ? roi_m : 0;
				roi_margin.value = roi_m;
				let roi_x = rectangle.left - roi_m > 0 ? rectangle.left - roi_m : 0;
				let roi_y = rectangle.top - roi_m > 0 ? rectangle.top - roi_m : 0;
				set_ROI_size(main_canvas, roi_canvas, roi_ctx, roi_x, roi_y, roi_m);
				roi_ctx.drawImage(video_input, roi_x, roi_y, roi_canvas.width, roi_canvas.height, 0, 0, roi_canvas.width, roi_canvas.height);
				main_ctx.strokeStyle = "green";
				main_ctx.lineWidth = 1;
				main_ctx.strokeRect(roi_x, roi_y, roi_canvas.width, roi_canvas.height);
				let roi_tmp = cv.imread('roi_canvas');
				let roi = new cv.Mat();
				cv.cvtColor(roi_tmp, roi, cv.COLOR_RGBA2GRAY, 0);
				roi_tmp.delete();
			
				let mask = new cv.Mat();
				if (mask_img)
				{
					cv.cvtColor(mask_img, mask, cv.COLOR_RGBA2GRAY, 0);
					cv.threshold(mask, mask, 1, 255, cv.THRESH_BINARY_INV);
					cv.resize(mask, mask, rectangle, fx = 0, fy = 0, interpolation = cv.INTER_LINEAR);
				}
				
				let dst = new cv.Mat();
				cv.matchTemplate(roi, template, dst, cv.TM_CCOEFF_NORMED, mask);
				roi.delete();
				mask.delete();
				let mask_2 = new cv.Mat();
				let result = cv.minMaxLoc(dst, mask_2);
				dst.delete();
				mask_2.delete();
				
				let similarity = Math.floor(result.maxVal * 100);
				similarity = similarity >= 0 ? similarity : 0;
				document.getElementById('similarity_panel').innerHTML = similarity + '%';
				main_ctx.strokeStyle = "red";
				main_ctx.lineWidth = 1;
				main_ctx.strokeRect(roi_x + result.maxLoc.x, roi_y + result.maxLoc.y, rectangle.width, rectangle.height);
				
				if (similarity < parseInt(alarm_threshold.value, 10) && stop_and_restore_watching_button.innerText == STOP_WATCHING_TEXT)
				{
					alarm = true;
				}
			}
			catch(err)
			{
				console.log('process_video_loop ERROR: ' + err.name + ' ' + err.message);
			}
			main_ctx.strokeStyle = "blue";
			main_ctx.lineWidth = 1;
			main_ctx.strokeRect(rectangle.left, rectangle.top, rectangle.width, rectangle.height);
		}
		fps_frames_no++;
		if (Date.now() - fps_begin >= 1000)
		{
			document.getElementById('bottom_panel').innerHTML = 'resolution: ' + video_input.videoWidth + 'x' +  video_input.videoHeight + ' fps: ' + fps_frames_no;
			fps_frames_no = 0;
			fps_begin = Date.now();
			if (alarm)
			{
				if (color_ind)
				{
					document.getElementById('container').style.backgroundColor = "lightgray";
					color_ind = false;
				}
				else
				{
					document.getElementById('container').style.backgroundColor = "red";
					color_ind = true;
					ALARM_SOUND.play();
				}
			}
		}
		let t = 1000/FPS - (Date.now() - begin);
		t = (t > 0)? t : 0;
		setTimeout(process_video_loop, t);
	})();
}

function init_rectangle_drawing(video_input, main_canvas, main_ctx, template_canvas, template_ctx, mask_canvas, mask_ctx)
{
	let boundingClientRect = main_canvas.getBoundingClientRect();
	let mouse_x1, mouse_y1;
	
	main_canvas.addEventListener('mousedown', 
		function(e) 
		{
			template = null;
			template_ctx.clearRect(0, 0, template_canvas.width, template_canvas.height);
			mouse_x1 = e.clientX - boundingClientRect.left;
			mouse_y1 = e.clientY - boundingClientRect.top;
			main_canvas.style.cursor = "crosshair";
			mouse_down = true;
		});

	main_canvas.addEventListener('mouseup', 
		function(e) 
		{
			if (mouse_down && rectangle.width > 0 && rectangle.height > 0)
			{
				let template_canvas_width = rectangle.width;
				let template_canvas_height = rectangle.height;
				let template_zoom = 1.0;
				draw_template(video_input, template_canvas, template_ctx, template_canvas_width, template_canvas_height, template_zoom);
				let template_tmp = cv.imread('template_canvas');
				template = new cv.Mat();
				cv.cvtColor(template_tmp, template, cv.COLOR_RGBA2GRAY, 0);
				template_tmp.delete();
				if (template_canvas_width > TEMPLATE_CANVAS_MAX_WIDTH || template_canvas_height > TEMPLATE_CANVAS_MAX_HEIGHT)
				{
					let template_zoom_x = TEMPLATE_CANVAS_MAX_WIDTH / template_canvas_width;
					let template_zoom_y = TEMPLATE_CANVAS_MAX_HEIGHT / template_canvas_height;
					template_zoom = Math.min(template_zoom_x, template_zoom_y);
					template_canvas_width = Math.floor(template_zoom * template_canvas_width);
					template_canvas_height = Math.floor(template_zoom * template_canvas_height);
					template_canvas_width = template_canvas_width > TEMPLATE_CANVAS_MAX_WIDTH ? TEMPLATE_CANVAS_MAX_WIDTH : template_canvas_width;
					template_canvas_height = template_canvas_height > TEMPLATE_CANVAS_MAX_HEIGHT ? TEMPLATE_CANVAS_MAX_HEIGHT : template_canvas_height;
					draw_template(video_input, template_canvas, template_ctx, template_canvas_width, template_canvas_height, template_zoom);
				}
				document.getElementById('aux_content').style.width = template_canvas_width + 'px';
				mask_img = null;
				mask_ctx.clearRect(0, 0, mask_canvas.width, mask_canvas.height);
				set_canvas_size(mask_canvas, template_canvas_width, template_canvas_height);
			}
			mouse_down = false;
			main_canvas.style.cursor = "default";
		});

	main_canvas.addEventListener('mousemove', 
		function(e) 
		{
			if (mouse_down)
			{
				let mouse_x2 = e.clientX - boundingClientRect.left;
				let mouse_y2 = e.clientY - boundingClientRect.top;
				rectangle.width = Math.abs(mouse_x2 - mouse_x1);
				rectangle.height = Math.abs(mouse_y2 - mouse_y1);
				if (rectangle.width > 0 && rectangle.height > 0)
				{
					rectangle.left = Math.min(mouse_x2, mouse_x1);
					rectangle.top = Math.min(mouse_y2, mouse_y1);
					main_ctx.clearRect(0, 0, main_canvas.width, main_canvas.height);
					main_ctx.strokeStyle = "blue";
					main_ctx.lineWidth = 1;
					main_ctx.strokeRect(rectangle.left, rectangle.top, rectangle.width, rectangle.height);
				}
			}
		});
}

function init_mask_drawing(mask_canvas, mask_ctx)
{
	let boundingClientRect = null;
	let mask_mouse_down_setTimeout = null;
	let mask_mouse_down = false;
	
	mask_canvas.addEventListener('mousedown', 
		function(e) 
		{
			if (template)
			{
				boundingClientRect = mask_canvas.getBoundingClientRect();
				mask_img = null;
				mask_ctx.clearRect(0, 0, mask_canvas.width, mask_canvas.height);
				let mask_mouse_x = e.clientX - boundingClientRect.left;
				let mask_mouse_y = e.clientY - boundingClientRect.top;
				mask_canvas.style.cursor = "crosshair";
				mask_ctx.beginPath();
				mask_ctx.moveTo(mask_mouse_x, mask_mouse_y);
				mask_mouse_down = true;
				if (mask_mouse_down_setTimeout) clearTimeout(mask_mouse_down_setTimeout);
				mask_mouse_down_setTimeout = setTimeout(() => {
					mask_mouse_down = false;
					mask_canvas.style.cursor = "default";
				}, 2000);
			}
		});

	mask_canvas.addEventListener('mouseup', 
		function(e) 
		{
			if (mask_mouse_down && template)
			{
				mask_mouse_down = false;
				mask_canvas.style.cursor = "default";
				if (mask_mouse_down_setTimeout)
				{
					clearTimeout(mask_mouse_down_setTimeout);
					mask_mouse_down_setTimeout = null;
				}
			}
		});

	mask_canvas.addEventListener('mousemove', 
		function(e) 
		{
			if (mask_mouse_down && template)
			{
				let mask_mouse_x = e.clientX - boundingClientRect.left;
				let mask_mouse_y = e.clientY - boundingClientRect.top;
				mask_ctx.strokeStyle = "blue";
				mask_ctx.lineWidth = 10;
				mask_ctx.lineTo(mask_mouse_x, mask_mouse_y);
				mask_ctx.stroke();
				mask_img = cv.imread('mask_canvas');
				if (mask_mouse_down_setTimeout) clearTimeout(mask_mouse_down_setTimeout);
				mask_mouse_down_setTimeout = setTimeout(() => {
					mask_mouse_down = false;
					mask_canvas.style.cursor = "default";
				}, 2000);
			}
		});
	
	mask_canvas.addEventListener('mouseleave', 
		function(e) 
		{
			if (mask_mouse_down && template)
			{
				mask_ctx.closePath();
			}
		});
	
	mask_canvas.addEventListener('mouseenter', 
		function(e) 
		{
			if (mask_mouse_down && template)
			{
				let mask_mouse_x = e.clientX - boundingClientRect.left;
				let mask_mouse_y = e.clientY - boundingClientRect.top;
				mask_ctx.beginPath();
				mask_ctx.moveTo(mask_mouse_x, mask_mouse_y);
				if (mask_mouse_down_setTimeout) clearTimeout(mask_mouse_down_setTimeout);
				mask_mouse_down_setTimeout = setTimeout(() => {
					mask_mouse_down = false;
					mask_canvas.style.cursor = "default";
				}, 2000);
			}
		});
}

function draw_template(video_input, template_canvas, template_ctx, template_canvas_width, template_canvas_height, template_zoom)
{
	template_ctx.scale(template_zoom, template_zoom);
	set_canvas_size(template_canvas, template_canvas_width, template_canvas_height);
	template_ctx.drawImage(video_input, rectangle.left, rectangle.top, rectangle.width, rectangle.height, 0, 0, template_canvas_width, template_canvas_height);
}

function set_canvas_size(dst_canvas, new_width, new_height)
{
	dst_canvas.width = new_width;
	dst_canvas.height = new_height;
	dst_canvas.style.width = new_width + 'px';
	dst_canvas.style.height = new_height + 'px';
}

function set_ROI_size(main_canvas, roi_canvas, roi_ctx, roi_x, roi_y, margin)
{
	let new_width = rectangle.width + 2 * margin;
	let new_height = rectangle.height + 2 * margin;
	if (roi_x + new_width > main_canvas.width)
	{
		new_width = main_canvas.width - roi_x;
	}
	if (roi_y + new_height > main_canvas.height)
	{
		new_height = main_canvas.height - roi_y;
	}
	set_canvas_size(roi_canvas, new_width, new_height);
	roi_ctx.clearRect(0, 0, roi_canvas.width, roi_canvas.height);
}

function clear_template_and_alarm()
{
	clear_template_request = true;
	alarm = false;
	document.getElementById('container').style.backgroundColor = "lightgray";
	document.getElementById('stop_and_restore_watching_button').innerText = STOP_WATCHING_TEXT;
	document.getElementById('stop_and_restore_watching_button').style.backgroundColor = "#0080C0";
}

function stop_and_restore_watching()
{
	if (document.getElementById('stop_and_restore_watching_button').innerText == STOP_WATCHING_TEXT)
	{
		document.getElementById('stop_and_restore_watching_button').innerText = RESTORE_WATCHING_TEXT;
		document.getElementById('stop_and_restore_watching_button').style.backgroundColor = "red";
		alarm = false;
		document.getElementById('container').style.backgroundColor = "lightgray";
	}
	else
	{
		document.getElementById('stop_and_restore_watching_button').innerText = STOP_WATCHING_TEXT;
		document.getElementById('stop_and_restore_watching_button').style.backgroundColor = "#0080C0";
	}
}
