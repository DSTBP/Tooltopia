(function() {
    var width, height, canvas, ctx, points, target, animateHeader = true;

    // 初始化
    initHeader();
    initAnimation();
    addListeners();

    function initHeader() {
        width = window.innerWidth;
        height = window.innerHeight;
        target = {x: width/2, y: height/2};

        canvas = document.getElementById('background-canvas');
        canvas.width = width;
        canvas.height = height;
        ctx = canvas.getContext('2d');

        // 创建点阵
        points = [];
        var spacing = Math.max(width, height) / 25; // 增加密度：从 15 改为 20
        for(var x = 0; x < width; x = x + spacing) {
            for(var y = 0; y < height; y = y + spacing) {
                var px = x + Math.random() * spacing;
                var py = y + Math.random() * spacing;
                var p = {x: px, originX: px, y: py, originY: py };
                points.push(p);
            }
        }

        // 为每个点找到最近的5个点
        for(var i = 0; i < points.length; i++) {
            var closest = [];
            var p1 = points[i];
            for(var j = 0; j < points.length; j++) {
                var p2 = points[j]
                if(!(p1 == p2)) {
                    var placed = false;
                    for(var k = 0; k < 5; k++) { // 从 5 改为 6，增加连接数
                        if(!placed) {
                            if(closest[k] == undefined) {
                                closest[k] = p2;
                                placed = true;
                            }
                        }
                    }

                    for(var k = 0; k < 5; k++) { // 从 5 改为 6
                        if(!placed) {
                            if(getDistance(p1, p2) < getDistance(p1, closest[k])) {
                                closest[k] = p2;
                                placed = true;
                            }
                        }
                    }
                }
            }
            p1.closest = closest;
        }

        // 为每个点创建圆圈
        for(var i in points) {
            var c = new Circle(points[i], 2.5 + Math.random() * 2.5, 'rgba(255,255,255,0.4)'); // 增大圆圈，提高不透明度
            points[i].circle = c;
        }
    }

    // 事件监听
    function addListeners() {
        if(!('ontouchstart' in window)) {
            window.addEventListener('mousemove', mouseMove);
        }
        window.addEventListener('scroll', scrollCheck);
        window.addEventListener('resize', resize);
    }

    function mouseMove(e) {
        var posx = 0, posy = 0;
        if (e.pageX || e.pageY) {
            posx = e.pageX;
            posy = e.pageY;
        } else if (e.clientX || e.clientY) {
            posx = e.clientX + document.body.scrollLeft + document.documentElement.scrollLeft;
            posy = e.clientY + document.body.scrollTop + document.documentElement.scrollTop;
        }
        target.x = posx;
        target.y = posy;
    }

    function scrollCheck() {
        if(document.body.scrollTop > height || document.documentElement.scrollTop > height) {
            animateHeader = false;
        } else {
            animateHeader = true;
        }
    }

    function resize() {
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = width;
        canvas.height = height;
    }

    // 动画循环
    function initAnimation() {
        animate();
        for(var i in points) {
            shiftPoint(points[i]);
        }
    }

    function animate() {
        if(animateHeader) {
            ctx.clearRect(0, 0, width, height);
            for(var i in points) {
                // 根据距离检测点的活跃度
                var distance = Math.abs(getDistance(target, points[i]));
                if(distance < 4000) {
                    points[i].active = 0.5;  // 从 0.3 提高到 0.5
                    points[i].circle.active = 0.8;  // 从 0.6 提高到 0.8
                } else if(distance < 20000) {
                    points[i].active = 0.2;  // 从 0.1 提高到 0.2
                    points[i].circle.active = 0.5;  // 从 0.3 提高到 0.5
                } else if(distance < 40000) {
                    points[i].active = 0.05;  // 从 0.02 提高到 0.05
                    points[i].circle.active = 0.2;  // 从 0.1 提高到 0.2
                } else {
                    points[i].active = 0.01;  // 基础可见度从 0 改为 0.01
                    points[i].circle.active = 0.05;  // 基础可见度从 0 改为 0.05
                }

                drawLines(points[i]);
                points[i].circle.draw();
            }
        }
        requestAnimationFrame(animate);
    }

    function shiftPoint(p) {
        // 使用简单的缓动替代 TweenLite
        var duration = 1000 + Math.random() * 1000;
        var targetX = p.originX - 50 + Math.random() * 100;
        var targetY = p.originY - 50 + Math.random() * 100;
        var startX = p.x;
        var startY = p.y;
        var startTime = Date.now();

        function update() {
            var elapsed = Date.now() - startTime;
            var progress = Math.min(elapsed / duration, 1);

            // easeInOutCirc 缓动函数
            var eased = progress < 0.5
                ? (1 - Math.sqrt(1 - Math.pow(2 * progress, 2))) / 2
                : (Math.sqrt(1 - Math.pow(-2 * progress + 2, 2)) + 1) / 2;

            p.x = startX + (targetX - startX) * eased;
            p.y = startY + (targetY - startY) * eased;

            if(progress < 1) {
                requestAnimationFrame(update);
            } else {
                shiftPoint(p);
            }
        }
        update();
    }

    // Canvas 绘制
    function drawLines(p) {
        if(!p.active) return;
        for(var i in p.closest) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.closest[i].x, p.closest[i].y);
            ctx.strokeStyle = 'rgba(120,120,120,' + p.active + ')'; // 从 100 提高到 120，更亮
            ctx.stroke();
        }
    }

    function Circle(pos, rad, color) {
        var _this = this;

        (function() {
            _this.pos = pos || null;
            _this.radius = rad || null;
            _this.color = color || null;
        })();

        this.draw = function() {
            if(!_this.active) return;
            ctx.beginPath();
            ctx.arc(_this.pos.x, _this.pos.y, _this.radius, 0, 2 * Math.PI, false);
            ctx.fillStyle = 'rgba(120,120,120,' + _this.active + ')'; // 从 100 提高到 120，更亮
            ctx.fill();
        };
    }

    // 工具函数
    function getDistance(p1, p2) {
        return Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2);
    }
})();
