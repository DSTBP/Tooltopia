(function () {
    var CONNECTION_COUNT = 5;
    var GRID_DIVISOR = 25;
    var SHIFT_RANGE = 50;
    var MIN_SHIFT_DURATION = 1000;
    var SHIFT_DURATION_RANGE = 1000;
    var ACTIVE_RANGES = [
        { distanceSq: 4000, lineOpacity: 0.5, circleOpacity: 0.8 },
        { distanceSq: 20000, lineOpacity: 0.2, circleOpacity: 0.5 },
        { distanceSq: 40000, lineOpacity: 0.05, circleOpacity: 0.2 }
    ];
    var IDLE_LINE_OPACITY = 0.01;
    var IDLE_CIRCLE_OPACITY = 0.05;

    var width = 0;
    var height = 0;
    var canvas = document.getElementById('background-canvas');
    var ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
    var points = [];
    var target = { x: 0, y: 0 };
    var animateHeader = true;
    var renderFrameId = null;
    var reducedMotionQuery = window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;
    var prefersReducedMotion = reducedMotionQuery ? reducedMotionQuery.matches : false;

    if (!canvas || !ctx) {
        return;
    }

    initHeader();
    addListeners();
    syncAnimationState();

    function initHeader() {
        width = window.innerWidth;
        height = window.innerHeight;
        target.x = width / 2;
        target.y = height / 2;
        canvas.width = width;
        canvas.height = height;
        points = buildPoints(performance.now());
    }

    function buildPoints(now) {
        var nextPoints = [];
        var spacing = Math.max(width, height) / GRID_DIVISOR;

        for (var x = 0; x < width; x += spacing) {
            for (var y = 0; y < height; y += spacing) {
                nextPoints.push(createPoint(x + Math.random() * spacing, y + Math.random() * spacing, now));
            }
        }

        assignClosestPoints(nextPoints);
        return nextPoints;
    }

    function createPoint(x, y, now) {
        var point = {
            x: x,
            y: y,
            originX: x,
            originY: y,
            startX: x,
            startY: y,
            targetX: x,
            targetY: y,
            startTime: now,
            duration: MIN_SHIFT_DURATION,
            active: IDLE_LINE_OPACITY
        };

        point.circle = new Circle(point, 2.5 + Math.random() * 2.5);
        resetPointMotion(point, now);
        return point;
    }

    function assignClosestPoints(pointList) {
        for (var i = 0; i < pointList.length; i += 1) {
            var currentPoint = pointList[i];
            var closest = [];

            for (var j = 0; j < pointList.length; j += 1) {
                var candidatePoint = pointList[j];

                if (currentPoint === candidatePoint) {
                    continue;
                }

                insertClosestPoint(closest, candidatePoint, getDistanceSquared(currentPoint, candidatePoint));
            }

            currentPoint.closest = mapClosestPoints(closest);
        }
    }

    function insertClosestPoint(closestPoints, point, distanceSq) {
        for (var i = 0; i < CONNECTION_COUNT; i += 1) {
            if (!closestPoints[i] || distanceSq < closestPoints[i].distanceSq) {
                closestPoints.splice(i, 0, {
                    point: point,
                    distanceSq: distanceSq
                });

                if (closestPoints.length > CONNECTION_COUNT) {
                    closestPoints.length = CONNECTION_COUNT;
                }
                return;
            }
        }
    }

    function mapClosestPoints(closestPoints) {
        var mappedPoints = [];

        for (var i = 0; i < closestPoints.length; i += 1) {
            mappedPoints.push(closestPoints[i].point);
        }

        return mappedPoints;
    }

    function addListeners() {
        if (!('ontouchstart' in window)) {
            window.addEventListener('mousemove', mouseMove);
        }

        window.addEventListener('scroll', scrollCheck, { passive: true });
        window.addEventListener('resize', resize);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        if (reducedMotionQuery) {
            if (typeof reducedMotionQuery.addEventListener === 'function') {
                reducedMotionQuery.addEventListener('change', handleMotionPreferenceChange);
            } else if (typeof reducedMotionQuery.addListener === 'function') {
                reducedMotionQuery.addListener(handleMotionPreferenceChange);
            }
        }
    }

    function mouseMove(event) {
        target.x = event.clientX;
        target.y = event.clientY;
    }

    function scrollCheck() {
        animateHeader = getScrollTop() <= height;
        syncAnimationState();
    }

    function resize() {
        initHeader();
        syncAnimationState();
    }

    function handleVisibilityChange() {
        syncAnimationState();
    }

    function handleMotionPreferenceChange(event) {
        prefersReducedMotion = event.matches;
        initHeader();
        syncAnimationState();
    }

    function syncAnimationState() {
        if (prefersReducedMotion) {
            stopAnimationLoop();
            renderStaticFrame();
            return;
        }

        if (!animateHeader || document.hidden) {
            stopAnimationLoop();
            return;
        }

        startAnimationLoop();
    }

    function startAnimationLoop() {
        if (renderFrameId !== null) {
            return;
        }

        renderFrameId = requestAnimationFrame(animate);
    }

    function stopAnimationLoop() {
        if (renderFrameId === null) {
            return;
        }

        cancelAnimationFrame(renderFrameId);
        renderFrameId = null;
    }

    function animate(now) {
        renderFrameId = requestAnimationFrame(animate);
        updateAndDrawScene(now);
    }

    function updateAndDrawScene(now) {
        ctx.clearRect(0, 0, width, height);

        for (var i = 0; i < points.length; i += 1) {
            var point = points[i];
            updatePointPosition(point, now);
            applyPointActivity(point);
            drawLines(point);
            point.circle.draw();
        }
    }

    function renderStaticFrame() {
        ctx.clearRect(0, 0, width, height);

        for (var i = 0; i < points.length; i += 1) {
            var point = points[i];
            point.active = IDLE_LINE_OPACITY;
            point.circle.active = IDLE_CIRCLE_OPACITY;
            drawLines(point);
            point.circle.draw();
        }
    }

    function updatePointPosition(point, now) {
        var elapsed = now - point.startTime;
        var progress = point.duration === 0 ? 1 : Math.min(elapsed / point.duration, 1);
        var eased = easeInOutCirc(progress);

        point.x = point.startX + (point.targetX - point.startX) * eased;
        point.y = point.startY + (point.targetY - point.startY) * eased;

        if (progress >= 1) {
            resetPointMotion(point, now);
        }
    }

    function resetPointMotion(point, now) {
        point.startX = point.x;
        point.startY = point.y;
        point.targetX = point.originX - SHIFT_RANGE + Math.random() * SHIFT_RANGE * 2;
        point.targetY = point.originY - SHIFT_RANGE + Math.random() * SHIFT_RANGE * 2;
        point.startTime = now;
        point.duration = MIN_SHIFT_DURATION + Math.random() * SHIFT_DURATION_RANGE;
    }

    function applyPointActivity(point) {
        var distanceSq = getDistanceSquared(target, point);

        for (var i = 0; i < ACTIVE_RANGES.length; i += 1) {
            if (distanceSq < ACTIVE_RANGES[i].distanceSq) {
                point.active = ACTIVE_RANGES[i].lineOpacity;
                point.circle.active = ACTIVE_RANGES[i].circleOpacity;
                return;
            }
        }

        point.active = IDLE_LINE_OPACITY;
        point.circle.active = IDLE_CIRCLE_OPACITY;
    }

    function drawLines(point) {
        if (!point.active) {
            return;
        }

        ctx.strokeStyle = 'rgba(120,120,120,' + point.active + ')';

        for (var i = 0; i < point.closest.length; i += 1) {
            ctx.beginPath();
            ctx.moveTo(point.x, point.y);
            ctx.lineTo(point.closest[i].x, point.closest[i].y);
            ctx.stroke();
        }
    }

    function Circle(position, radius) {
        this.pos = position;
        this.radius = radius;
        this.active = IDLE_CIRCLE_OPACITY;
    }

    Circle.prototype.draw = function () {
        if (!this.active) {
            return;
        }

        ctx.beginPath();
        ctx.arc(this.pos.x, this.pos.y, this.radius, 0, 2 * Math.PI, false);
        ctx.fillStyle = 'rgba(120,120,120,' + this.active + ')';
        ctx.fill();
    };

    function easeInOutCirc(progress) {
        return progress < 0.5
            ? (1 - Math.sqrt(1 - Math.pow(2 * progress, 2))) / 2
            : (Math.sqrt(1 - Math.pow(-2 * progress + 2, 2)) + 1) / 2;
    }

    function getDistanceSquared(pointA, pointB) {
        var deltaX = pointA.x - pointB.x;
        var deltaY = pointA.y - pointB.y;
        return deltaX * deltaX + deltaY * deltaY;
    }

    function getScrollTop() {
        return window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    }
})();
