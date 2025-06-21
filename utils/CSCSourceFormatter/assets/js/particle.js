/*
 * @Description: 粒子效果配置
 * @Author: DSTBP
 * @Date: 2025-04-15 07:58:00
 * @LastEditTime: 2025-04-15 15:07:53
 * @LastEditors: DSTBP
 */

// 获取当前主题
const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';

// 配置粒子效果
particlesJS('particles-js', {
    particles: {
        number: {
            value: 80,
            density: {
                enable: true,
                value_area: 800
            }
        },
        color: {
            value: currentTheme === 'dark' ? '#FFFFF0' : '#5463E3'
        },
        shape: {
            type: 'circle'
        },
        opacity: {
            value: 0.4,
            random: false
        },
        size: {
            value: 3,
            random: true
        },
        line_linked: {
            enable: true,
            distance: 150,
            color: currentTheme === 'dark' ? '#FFFFF0' : '#5463E3',
            opacity: 0.3,
            width: 1
        },
        move: {
            enable: true,
            speed: 2,
            direction: 'none',
            random: false,
            straight: false,
            out_mode: 'out',
            bounce: false
        }
    },
    interactivity: {
        detect_on: 'canvas',
        events: {
            onhover: {
                enable: true,
                mode: 'grab'
            },
            onclick: {
                enable: true,
                mode: 'push'
            },
            resize: true
        },
        modes: {
            grab: {
                distance: 140,
                line_linked: {
                    opacity: 1
                }
            },
            push: {
                particles_nb: 4
            }
        }
    },
    retina_detect: true
}); 