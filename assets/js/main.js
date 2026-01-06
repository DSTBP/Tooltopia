// 设备检测
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// 粒子配置
const particleConfig = {
    particles: {
        number: {
            value: isMobile ? 40 : 80,
            density: { enable: true, value_area: 800 }
        },
        color: { value: "#ffffff" },
        shape: { type: "circle" },
        opacity: {
            value: 0.5,
            anim: { enable: false }
        },
        size: {
            value: isMobile ? 2 : 3,
            random: true
        },
        line_linked: {
            enable: !isMobile,
            distance: 150,
            color: "#ffffff",
            opacity: 0.4,
            width: 1
        },
        move: {
            enable: true,
            speed: isMobile ? 1 : 2,
            direction: "none",
            out_mode: "out"
        }
    },
    interactivity: {
        detect_on: "canvas",
        events: {
            onhover: { enable: !isMobile, mode: "repulse" },
            onclick: { enable: true, mode: "push" },
            resize: true
        },
        modes: {
            repulse: { distance: 200, duration: 0.4 },
            push: { particles_nb: isMobile ? 2 : 4 }
        }
    },
    retina_detect: true
};

// 初始化粒子效果
particlesJS('particles-js', particleConfig);
