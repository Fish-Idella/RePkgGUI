/**
 * 国际化模块 - 提供多语言支持和文本本地化功能
 * 使用工厂函数模式创建具有多语言能力的函数对象
 */

// 使用 Symbol 创建唯一标识符，用于在 DOM 元素上存储预览数据引用
// Symbol 保证属性名全局唯一，避免与元素自身属性或第三方库冲突
const SYMBOL_PREVIEW_DATA = Symbol("preview");

/**
 * 全局轻量级消息提示框（Toast）
 * @param {string} text - 要显示的提示文本内容
 * @param {number} duration - 提示框显示持续时间（毫秒），默认 3000ms
 */
window.toast = function (text, duration = 3000) {
    // 动态创建提示框 DOM 元素
    const toastElement = document.createElement("div");
    toastElement.className = "toast";       // 设置基础样式类
    toastElement.textContent = text;        // 使用 textContent 防止 XSS 注入

    // 将提示框添加到页面 body 中
    document.body.appendChild(toastElement);
    // 添加 show 类触发 CSS 进入动画（淡入/滑入）
    toastElement.classList.add("show");

    // 到达指定时长后开始隐藏流程
    setTimeout(() => {
        // 移除 show 类触发 CSS 退出动画（淡出/滑出）
        toastElement.classList.remove("show");
        // 等待退出动画完成（500ms）后从 DOM 中彻底移除元素，释放内存
        setTimeout(() => toastElement.remove(), 500);
    }, duration);
};

/**
 * 国际化核心函数对象
 * 通过 Object.assign 将翻译函数与语言包数据、方法合并为一个可调用对象
 * 调用方式：localization("key") 返回翻译文本
 *          localization("key", element) 同时更新 DOM 元素并标记
 */
const localization = Object.assign(function localization(key, element, property = "textContent") {
    // 从当前语言包中查找对应键的翻译文本，未找到则降级返回 key 本身
    const string = localization.def?.[key] ?? key;

    if (element) {
        // 如果传入了 DOM 元素，则自动更新元素的指定属性
        if (typeof element.getAttribute === "function") {
            if (!Array.isArray(property)) {
                property = String(property).split(" ");
            }
            const obj = localization.deserializeAttr(element.getAttribute("data-i18n"));
            property.forEach(p => {
                // 禁止 innerHTML，规避XSS
                if (p === 'innerHTML') {
                    console.error('[i18n] `innerHTML` is forbidden');
                    return;
                }
                element[p] = string, obj[p] = key;
            });
            element.setAttribute("data-i18n", localization.serializeAttr(obj));
        } else {
            return string.replace(/\{\{\s*(\w+)\s*\}\}/g, function (match, key) {
                return Object.hasOwn(element, key) ? String(element[key]) : match; // 找不到则保留原文
            });
        }
    }
    return string;
}, {
    // 语言包数据集合，包含所有支持的语言及其翻译键值对
    locale: {},

    current: null,

    def: null,        // 当前激活的语言包字典引用，由 set() 方法赋值

    deserializeAttr(str) {
        if (!str) return {};
        return str.split(";").reduce((obj, item) => {
            const [property, ...rest] = item.split(':');
            if (property) {
                if (rest.length === 0) {
                    // data-i18n="key_string" -> data-i18n="textContent:key_string"
                    obj.textContent = property;
                } else if (property === "innerHTML") {
                    console.error("skip")
                } else if (property === "text") {
                    obj.textContent = rest.join(':');
                } else {
                    obj[property] = rest.join(':');
                }
            }
            return obj;
        }, {});
    },

    serializeAttr(records) {
        return Object.entries(records)
            .filter(([p]) => p !== "innerHTML")
            .map(([property, key]) => `${property}:${key}`).join(";");
    },

    add(lang, obj) {
        const lc = String(lang).toLowerCase();
        localization.locale[lc] = Object.assign({}, localization.locale[lc] ?? {}, obj);
    },

    init() {
        return localization.set(localization.getEnvLang());
    },

    getEnvLang() {
        if (localStorage.getItem("localization")) {
            return localStorage.getItem("localization");
        }
        // 获取浏览器首选语言列表（按优先级排序）
        const langs = navigator.languages || [navigator.language || navigator.userLanguage];
        const keys = Object.keys(localization.locale);
        if (keys.length === 0) {
            throw new SyntaxError("language packs is empty");
        }
        // 遍历浏览器语言偏好，匹配第一个支持的语言
        for (const lang of langs) {
            // 精确匹配（如 zh-CN）
            if (localization.locale[lang]) return lang;
            // 前缀匹配（如浏览器返回 zh-TW，降级到 zh-CN）
            const prefix = lang.split("-")[0];
            const matched = keys.find(k => k.startsWith(prefix));
            if (matched) return matched;
        }
        // 无匹配时回退到第一个可用
        return keys[0];
    },

    /**
     * 设置/切换当前语言
     * @param {string} lang - 目标语言代码（如 "zh-CN"、"en-US"）
     * @returns {Promise<void>} 返回 Promise，在 DOM 就绪且所有标记元素刷新完成后 resolve
     */
    async set(lang) {
        // 更新当前语言代码，并将对应的语言包赋值给 def
        localization.current = String(lang).toLowerCase();
        localization.def = localization.locale[localization.current];
        if (!localization.def) {
            throw new SyntaxError("language packs no supported");
        }
        // 将语言偏好持久化到 localStorage，下次启动自动恢复
        localStorage.setItem("localization", localization.current);

        // 等待文档完全就绪后再执行 DOM 刷新，避免操作未渲染的元素
        await new Promise(function (resolve) {
            // 文档就绪回调，同时监听 DOMContentLoaded 和 load 两个事件以兼容不同加载时序
            function completed() {
                document.removeEventListener("DOMContentLoaded", completed);
                window.removeEventListener("load", completed);
                resolve();
            }
            // 判断文档是否已经就绪
            if (document.readyState === "complete" ||
                (document.readyState !== "loading" && !document.documentElement.doScroll)) {
                // 已就绪：用 setTimeout 将 resolve 推入微任务队列，避免同步执行导致的时序问题
                window.setTimeout(resolve);
            } else {
                // 未就绪：注册事件监听器等待文档加载完成
                document.addEventListener("DOMContentLoaded", completed);
                window.addEventListener("load", completed);
            }
        });

        // DOM 就绪后，遍历所有带 data-i18n 标记的元素，重新应用新语言的翻译
        document.querySelectorAll("[data-i18n]").forEach(item => {
            try {
                Object.entries(localization.deserializeAttr(item.getAttribute("data-i18n")))
                    .forEach(([property, key]) => localization(key, item, property));
            } catch (e) {
                console.warn('[i18n] Failed to update element:', item, e);
            }
        });

    }
});

// ========== 中文简体语言包 ==========
localization.add("zh-CN", {
    locale_name: "中文简体",               // 语言自身的显示名称（用于语言选择器）
    // --- 右键菜单相关文本 ---
    menu_copy_absolute_path: "复制文件地址",
    menu_open_in_explorer: "在资源管理器中打开",
    menu_open_in_steam: "在Steam创意工坊中打开",
    menu_open_in_extract_dir: "在提取目录中打开",
    menu_open_in_browser: "预览",
    menu_reload_list: "刷新列表",
    menu_select_all: "全选",
    menu_reverse_selection: "反选",
    menu_cancel_selection: "取消选择",
    menu_extract_selected: "提取选中",
    // --- 界面通用文本 ---
    app_title: "壁纸引擎管理工具",          // 用于 <title> 标签
    ui_dirs: "目录",
    ui_extract: "提取",
    ui_applications: "应用程序",
    ui_language: "语言（Language）",
    // --- 表格表头文本 ---
    table_header_item: "项目",
    table_header_current_version: "当前版本",
    table_header_latest_version: "最新版本",
    // --- 错误与信息提示文本 ---
    error_runtime: "运行环境错误",
    error_extract_not_found: "当前壁纸似乎还没提取哦",
    error_no_output_dir: "未选择输出目录",
    error_no_file_selected: "请选择需要提取的文件",
    error_not_supported: "不支持预览的类型",
    info_extract_complete: "提取结束，失败{{n}}个",   // {{n}} 为占位符，运行时替换为数字
    // --- 目录管理相关文本 ---
    dirs_workshop: "创意工坊目录",
    dirs_output: "文件导出目录",
    dirs_option_select: "选择目录",
    dirs_option_open: "打开目录",
    dirs_option_auto_find: "自动查找",
    // --- 提取操作相关文本 ---
    extract_selected: "全部提取",
    extract_pkg: "单文件提取",
    // --- 版本信息面板相关文本 ---
    version_title: "版本信息",
    version_repkg_gui: "RePKG-GUI",
    version_repkg: "RePKG",
    version_open_in_explorer: "在资源管理器中打开",
    version_update_not_checked: "未检查版本更新",
    version_check_for_updates: "检查更新",
    version_latest_version: "最新版本",
    version_update_available: "有新版本可用",
    version_get_failed: "无法获取版本信息"
});

// ========== 英文语言包 ==========
localization.add("en-US", {
    locale_name: "English",
    // --- 右键菜单相关文本 ---
    menu_copy_absolute_path: "Copy Absolute Path",
    menu_open_in_explorer: "Open In Explorer",
    menu_open_in_steam: "Open In Steam",
    menu_open_in_extract_dir: "Open In Extract Directory",
    menu_open_in_browser: "Preview",
    menu_reload_list: "Reload List",
    menu_select_all: "Select All",
    menu_reverse_selection: "Reverse Selection",
    menu_cancel_selection: "Cancel Selection",
    menu_extract_selected: "Extract Selected",
    // --- 界面通用文本 ---
    app_title: "Wallpaper Engine Manager",
    ui_dirs: "Directories",
    ui_extract: "Extract",
    ui_applications: "Applications",
    ui_language: "Language（语言）",
    // --- 表格表头文本 ---
    table_header_item: "Item",
    table_header_current_version: "Current Version",
    table_header_latest_version: "Latest Version",
    // --- 错误与信息提示文本 ---
    error_runtime: "Runtime Error",
    error_extract_not_found: "The wallpaper does not seem to have been extracted yet.",
    error_no_output_dir: "No output directory selected.",
    error_no_file_selected: "Please select files to extract.",
    info_extract_complete: "Extraction completed, {{n}} failed.",
    // --- 目录管理相关文本 ---
    dirs_workshop: "Workshop Directory",
    dirs_output: "Output Directory",
    dirs_option_select: "Select",
    dirs_option_open: "Open",
    dirs_option_auto_find: "Auto Find",
    // --- 提取操作相关文本 ---
    extract_selected: "Extract Selected",
    extract_pkg: "Extract PKG",
    // --- 版本信息面板相关文本 ---
    version_title: "Version Info",
    version_repkg_gui: "RePKG-GUI",
    version_repkg: "RePKG",
    version_open_in_explorer: "Open In Explorer",
    version_update_not_checked: "NOT Checked",
    version_check_for_updates: "Check For Updates",
    version_latest_version: "Latest Version",
    version_update_available: "Update Available",
    version_get_failed: "Failed To Get Version Info"
});

/**
 * 应用主入口
 * 先初始化语言设置，待 DOM 刷新完成后执行应用核心逻辑
 */
localization.init().then(function () {
    // 获取 WebView2 暴露的 C# 宿主对象，用于前后端通信
    // 该对象仅在 Microsoft Edge/Chrome WebView2 环境中可用
    const csharpHostObject = window?.chrome?.webview?.hostObjects?.CSharpObject;

    // 应用初始化状态标志，用于控制首次加载预览列表的时机
    let notInitialized = true;

    // 检测运行环境：如果 C# 宿主对象不存在，说明不在 WebView2 中运行
    if (typeof csharpHostObject === "undefined") {
        window.toast(localization("error_runtime"));
    }

    /**
     * 全局应用数据中心
     * 集中管理命令模板、预览配置、右键菜单、目录配置和版本信息等所有应用状态
     */
    const applicationData = {
        // 文件提取命令模板，<output_dir> 和 <file_path> 为运行时替换占位符
        command: 'extract -o "<output_dir>" "<file_path>"',

        /**
         * 从壁纸路径中提取 Steam 创意工坊 ID
         * 路径格式示例：...\123456\789012\project.json → 返回 "789012"
         * @param {string} path - 壁纸 project.json 文件的完整路径
         * @returns {string|null} 创意工坊 ID，匹配失败返回 null
         */
        getIdByPath(path) {
            const arr = path.match(/\d+\\(\d+)\\project\.json/);
            return arr ? arr[1] : null;
        },

        // ==================== 文件预览模块配置 ====================
        preview: {
            element: document.querySelector("#file-grid"),      // 预览网格容器 DOM 引用
            contextmenu: {
                element: document.querySelector("#file-grid-menu"), // 右键菜单 DOM 引用

                /**
                 * 显示右键菜单并进行视口边界检测
                 * @param {number} top - 鼠标点击的 Y 坐标
                 * @param {number} left - 鼠标点击的 X 坐标
                 * @param {HTMLElement} boundElement - 触发右键菜单的预览项元素
                 */
                show(top, left, boundElement) {
                    const menu = this.element;
                    // 使用 Symbol 键将触发元素绑定到 applicationData 上，供菜单操作回调访问
                    applicationData[SYMBOL_PREVIEW_DATA] = boundElement;
                    // 先将菜单设为透明，避免位置调整过程中闪烁
                    menu.style.setProperty("opacity", "0");
                    menu.classList.remove("hide");    // 移除隐藏类使菜单可见

                    // 使用 setTimeout 延迟到下一帧执行，确保菜单已完成布局可获取尺寸
                    setTimeout(() => {
                        const menuRect = menu.getBoundingClientRect();
                        const viewportWidth = window.innerWidth;
                        const viewportHeight = window.innerHeight;

                        // 水平边界检测：如果菜单右边缘超出视口，向左翻转
                        if (left + menuRect.width > viewportWidth) {
                            left = Math.max(0, left - menuRect.width);
                        }
                        // 垂直边界检测：如果菜单下边缘超出视口，向上翻转
                        if (top + menuRect.height > viewportHeight) {
                            top = Math.max(0, top - menuRect.height);
                        }

                        // 应用修正后的位置并显示菜单
                        menu.style.setProperty("top", top + "px");
                        menu.style.setProperty("left", left + "px");
                        menu.style.setProperty("opacity", "1");
                    });
                },

                /**
                 * 隐藏右键菜单
                 */
                hide() {
                    this.element.classList.add("hide");
                },

                // 右键菜单选项定义数组，每个选项包含翻译键和执行回调
                options: [{
                    // 在浏览器中预览壁纸（仅支持 web 和 video 类型）
                    key: "menu_open_in_browser",
                    exec() {
                        // 通过 Symbol 键获取当前右键点击的预览项绑定的数据
                        const [path, obj] = previewViewModel.data[applicationData[SYMBOL_PREVIEW_DATA].dataset.key];
                        switch (obj.type) {
                            case "web":
                            case "video": {
                                // 构建 file:// 协议 URL，将 Windows 反斜杠转为正斜杠
                                const base = "file:///" + path.replace(/\\/g, '/');
                                const file = new URL(obj.file, base).href;

                                // 计算窗口居中位置（960x540 尺寸）
                                const left = Math.round((window.screen.width - 960) / 2);
                                const top = Math.round((window.screen.height - 540) / 3);
                                // 打开独立预览窗口，禁用地址栏
                                open(file, 'prview', `width=960,height=540,left=${left},top=${top},location=no`);
                                break;
                            }
                            default: {
                                toast(localization("error_not_supported"))
                            }
                        }
                    }
                }, {
                    // 在 Windows 资源管理器中打开壁纸所在目录
                    key: "menu_open_in_explorer",
                    exec() {
                        csharpHostObject.OpenInExplorer(
                            previewViewModel.data[applicationData[SYMBOL_PREVIEW_DATA].dataset.key][0]
                        );
                    }
                }, {
                    // 在 Steam 创意工坊中打开壁纸页面
                    key: "menu_open_in_steam",
                    exec() {
                        const path = previewViewModel.data[applicationData[SYMBOL_PREVIEW_DATA].dataset.key][0];
                        const id = applicationData.getIdByPath(path);
                        if (id) {
                            // 使用 steam:// 协议唤起 Steam 客户端
                            window.open("steam://url/CommunityFilePage/" + id);
                        }
                    }
                }, {
                    // 在提取输出目录中打开（hr: true 表示此项上方显示分隔线）
                    key: "menu_open_in_extract_dir",
                    hr: true,
                    exec() {
                        const path = previewViewModel.data[applicationData[SYMBOL_PREVIEW_DATA].dataset.key][0];
                        const id = applicationData.getIdByPath(path);
                        // 异步获取输出目录下所有已提取的壁纸路径
                        csharpHostObject.GetAllPath(applicationData.dirs.options[1].element.value).then(result => {
                            const paths = JSON.parse(result);
                            // 查找文件名以当前壁纸 ID 开头的已提取目录
                            const path = paths.find(path => String(path).split("\\").slice(-1).at(0).startsWith(id));
                            if (path) {
                                csharpHostObject.OpenInExplorer(path);
                            } else {
                                window.toast(localization("error_extract_not_found"));
                            }
                        });
                    }
                }, {
                    // 刷新预览列表（清除选中状态后重新加载）
                    key: "menu_reload_list",
                    hr: true,
                    exec() {
                        applicationData.preview.element.querySelectorAll("div.preview.selected")
                            .forEach(item => item.classList.remove("selected"));
                        loadPreviewList(applicationData.dirs.options[0].element.value);
                    }
                }, {
                    // 全选所有预览项
                    key: "menu_select_all",
                    exec() {
                        applicationData.preview.element.querySelectorAll("div.preview.scene")
                            .forEach(item => item.classList.add("selected"));
                    }
                }, {
                    // 反选：已选变未选，未选变已选
                    key: "menu_reverse_selection",
                    exec() {
                        applicationData.preview.element.querySelectorAll("div.preview.scene")
                            .forEach(item => item.classList.toggle("selected"));
                    }
                }, {
                    // 取消所有选中
                    key: "menu_cancel_selection",
                    hr: true,
                    exec() {
                        applicationData.preview.element.querySelectorAll("div.preview.selected")
                            .forEach(item => item.classList.remove("selected"));
                    }
                }, {
                    // 批量提取选中的壁纸文件
                    key: "menu_extract_selected",
                    exec() {
                        // 获取所有选中且未被隐藏的预览项
                        const selected = applicationData.preview.element.querySelectorAll("div.preview.scene.selected:not(.hide)");
                        const outputDir = applicationData.dirs.options[1].element.value;

                        // 前置校验：输出目录未设置
                        if (!outputDir) {
                            window.toast(localization("error_no_output_dir"));
                            return;
                        }
                        // 前置校验：没有选中任何文件
                        if (selected.length === 0) {
                            window.toast(localization("error_no_file_selected"));
                            return;
                        }

                        // 使用 Promise.allSettled 并发执行所有提取任务
                        // allSettled 不会因单个失败而中断，确保所有任务都执行完毕
                        Promise.allSettled(Array.from(selected, item => {
                            const data = previewViewModel.data[item.dataset.key];
                            const path = data[0];
                            // 拼接 pkg 文件路径：将 project.json 替换为同名 .pkg 文件
                            const name = path.substring(0, 1 + path.lastIndexOf("\\")) + (data[1].file.replace(/\.json/i, ".pkg"));

                            // 生成输出子目录名：ID-标题，替换非法字符为连字符并去重
                            const dirName = (applicationData.getIdByPath(path) + "-" + data[1].title)
                                .replace(/[\\\/\"\:\*\?\<\>\|]+/g, "-")
                                .replace(/\-+/g, "-")
                                .replace(/^\-+|\-+$/g, "");

                            // 用实际路径替换命令模板中的占位符，并清理多余的反斜杠
                            const command = applicationData.command
                                .replace("<output_dir>", outputDir + "\\" + dirName)
                                .replace("<file_path>", name)
                                .replace(/\\{2,}/g, "\\");

                            // 调用 C# 后端执行提取命令
                            return csharpHostObject.RunCommand(command);
                        })).then(results => {
                            // 统计失败的任务数量
                            const errorCount = results.reduce((count, result) => {
                                // Promise 被 reject 视为失败
                                if (result.status === "rejected") return count + 1;
                                try {
                                    // 解析 JSON 响应，Error 字段为真值视为失败
                                    return JSON.parse(result.value).Error ? count + 1 : count;
                                } catch {
                                    return count + 1; // 非 JSON 响应也视为失败
                                }
                            }, 0);
                            // 显示提取结果提示，{{n}} 替换为失败数量
                            window.toast(localization("info_extract_complete", { n: errorCount }));
                        });
                    }
                }]
            }
        },

        // ==================== 目录管理模块配置 ====================
        dirs: {
            element: document.querySelector("#dirs>.box-content"),  // 目录面板容器
            options: [{
                element: null,          // 运行时由视图模型赋值的输入框 DOM 引用
                key: "dirs_workshop",   // 对应语言包中的翻译键，也用作 localStorage 存储键
                options: [{
                    // 手动选择创意工坊目录
                    key: "dirs_option_select",
                    exec(option) {
                        csharpHostObject.SelectDirectory().then(path => {
                            if (!path) return;    // 用户取消选择
                            option.element.value = path;
                            window.localStorage.setItem(option.key, path);  // 持久化路径
                            loadPreviewList(path);                          // 重新加载预览列表
                        });
                    }
                }, {
                    // 在资源管理器中打开当前设置的创意工坊目录
                    key: "dirs_option_open",
                    exec(option) {
                        csharpHostObject.OpenInExplorer(option.element.value);
                    }
                }, {
                    // 自动搜索 Steam 创意工坊目录
                    key: "dirs_option_auto_find",
                    exec(option) {
                        csharpHostObject.GetAllPath(null).then(result => {
                            const path = JSON.parse(result).at(0);   // 取第一个匹配路径
                            option.element.value = path;
                            window.localStorage.setItem(option.key, path);
                            loadPreviewList(path);
                        });
                    }
                }]
            }, {
                element: null,
                key: "dirs_output",     // 提取输出目录配置
                options: [{
                    key: "dirs_option_select",
                    exec(option) {
                        csharpHostObject.SelectDirectory().then(path => {
                            if (!path) return;
                            option.element.value = path;
                            window.localStorage.setItem(option.key, path);
                        });
                    }
                }, {
                    key: "dirs_option_open",
                    exec(option) {
                        csharpHostObject.OpenInExplorer(option.element.value);
                    }
                }]
            }]
        },

        // ==================== 版本信息模块配置 ====================
        version: {
            element: document.querySelector("table.version-table"), // 版本信息表格 DOM 引用
            options: [{
                key: "version_repkg_gui",
                name: null,             // null 表示获取宿主应用自身的版本
                version: null,          // 运行时填充的本地版本号数组
                url: "https://api.github.com/repos/Fish-Idella/RePkgGUI/releases/latest"  // GitHub 最新 release API
            }, {
                key: "version_repkg",
                name: "RePKG.exe",      // 指定要检查的外部可执行文件名
                version: null,
                url: "https://api.github.com/repos/notscuffed/repkg/releases/latest"
            }]
        }
    };

    /**
     * 加载并解析预览文件列表
     * @param {string} path - 创意工坊根目录路径
     */
    async function loadPreviewList(path) {
        // 调用 C# 后端获取目录下所有壁纸的 JSON 元数据
        const result = await csharpHostObject.GetAllJSON(path);
        // 解析并排序壁纸列表
        const entries = Object.entries(JSON.parse(result)).map(entry => {
            entry[1] = JSON.parse(entry[1]);                      // 二次解析嵌套 JSON
            entry[1].type = String(entry[1].type).toLowerCase();  // 统一类型为小写
            return entry;
        }).sort(function ([, a], [, b]) {
            // 排序规则：先按类型字母序排列，同类型内按标题字母序排列
            // undefined 类型的条目排到最后
            const A = a.type, B = b.type;
            if (A === B) {
                return a.title.localeCompare(b.title);
            } else if (A === "undefined") {
                return 1;
            } else if (B === "undefined") {
                return -1;
            }
            return A.localeCompare(B);
        });

        // 更新视图模型的数据数组长度并触发视图重新渲染
        previewViewModel.data.length = entries.length;
        previewViewModel.update(entries);
    }

    /**
     * 预览文件列表视图模型
     * 使用 PuSet.ViewManager 实现数据驱动的列表渲染
     */
    const previewViewModel = PuSet.ViewManager({
        target: applicationData.preview.element,      // 列表挂载容器
        selector: "&>div.preview",                     // 列表项 CSS 选择器
        data: [],                                      // 初始空数据
        /**
         * 单个预览卡片的渲染函数
         * @param {HTMLElement} div - 列表项 DOM 元素
         * @param {Array} param1 - 数据项 [文件路径, 元数据对象]
         * @param {string} key - 数据项索引键
         */
        layout(div, [path, obj], key) {
            div.classList.add(obj.type);               // 添加类型类（scene/web/video 等）
            div.dataset.key = key;                     // 存储索引键供事件回调使用
            div.dataset.type = obj.type;

            // 构建预览图的 file:// URL 并设置到 img 标签
            const base = "file:///" + path.replace(/\\/g, '/');
            div.querySelector("img").src = new URL(obj.preview, base).href;

            // 设置壁纸标题文本
            div.querySelector("div.title").textContent = obj.title;
        }
    }).on("contextmenu", function (event) {
        // 右键事件：阻止默认菜单，显示自定义右键菜单
        event.preventDefault();
        applicationData.preview.contextmenu.show(event.clientY, event.clientX, this);
    }).on("click", function (event) {
        // 左键点击：切换预览项的选中状态
        this.classList.toggle("selected");
    });

    // 封装隐藏菜单的快捷函数
    const hideMenu = () => applicationData.preview.contextmenu.hide();

    // 注册全局事件监听器，在用户交互时自动关闭右键菜单
    document.body.addEventListener("click", hideMenu);                          // 点击任意位置
    previewViewModel.target.parentElement.addEventListener("scroll", hideMenu); // 滚动预览区域
    window.addEventListener("resize", hideMenu);                                // 窗口大小变化

    /**
     * 右键菜单视图模型
     * 根据 applicationData.preview.contextmenu.options 动态生成菜单项
     */
    PuSet.ViewManager({
        target: applicationData.preview.contextmenu.element,
        selector: "&>div",
        data: applicationData.preview.contextmenu.options,
        layout(div, option) {
            // 使用国际化函数设置菜单项文本
            localization(option.key, div.querySelector("div.text"));
            div.dataset.key = option.key;
            // 如果选项配置了 hr: true，显示分隔线
            if (option.hr) {
                div.querySelector("hr").classList.remove("hide");
            }
        }
    }).on("click", function (event, value) {
        // 点击菜单项：先隐藏菜单，再用 setTimeout 延迟执行操作
        // 延迟确保菜单隐藏动画不被操作阻塞
        hideMenu(setTimeout(value.exec, 0));
    });

    /**
     * 将任意格式的版本字符串解析为四段数字数组
     * 例如："RePKG Beta Build v1.2.3 Stable" → [1, 2, 3, 0]
     * @param {string} versionString - 原始版本字符串
     * @returns {number[]} 四段版本号数组 [major, minor, patch, build]
     */
    const parseVersionToFourPartArray = function (versionString) {
        // 正则提取版本号数字部分（支持点分隔的多段数字）
        const versionMatch = versionString.match(/(\d+\.*)+/);
        const fourPartVersion = [0, 0, 0, 0]; // 默认四段全为 0

        if (Array.isArray(versionMatch)) {
            // 去除首尾的点号，再按点分割
            const cleanVersion = versionMatch[0].replace(/^\.+|\.+$/, '');
            const versionParts = cleanVersion.split(".");
            // 最多取前 4 段
            const partsToProcess = Math.min(versionParts.length, 4);

            for (let partIndex = 0; partIndex < partsToProcess; partIndex++) {
                fourPartVersion[partIndex] = Number(versionParts[partIndex]);
            }
        }

        return fourPartVersion;
    };

    /**
     * 比较两个四段版本号数组
     * @param {number[]} localVersion - 本地版本号
     * @param {number[]} remoteVersion - 远程版本号
     * @returns {number} 正数=远程更新，负数=本地更新，0=版本相同
     */
    function compareVersions(localVersion, remoteVersion) {
        for (let i = 0; i < 4; i++) {
            const compareResult = remoteVersion[i] - localVersion[i];
            if (compareResult !== 0) {
                return compareResult;
            }
        }
        return 0;
    }

    /**
     * 目录管理面板视图模型
     * 动态渲染目录输入框和操作按钮
     */
    PuSet.ViewManager({
        target: applicationData.dirs.element,
        selector: "&>div.item",
        data: applicationData.dirs.options,
        layout(div, option) {
            const title = div.querySelector(".item-title");
            // 设置目录项标题的国际化文本
            localization(option.key, title.querySelector("span"));
            // 保存输入框 DOM 引用到 option 对象，供后续操作使用
            option.element = div.querySelector(".item-content>input");

            // 异步加载目录路径：优先从 localStorage 读取，否则自动查找
            new Promise((resolve, reject) => {
                try {
                    const storeKey = option.key;
                    let path = window.localStorage.getItem(storeKey);

                    if (path) return resolve(path);   // 有缓存直接使用

                    // 无缓存时调用 C# 后端自动查找
                    csharpHostObject.GetAllPath(null).then(result => {
                        console.log(result);
                        path = JSON.parse(result).at(0);
                        window.localStorage.setItem(storeKey, path);
                        resolve(path);
                    });
                } catch (e) {
                    reject(e);
                }
            }).then(path => {
                option.element.value = path;
                // 仅在首次初始化时自动加载预览列表，避免重复加载
                if (notInitialized) {
                    notInitialized = false;
                    loadPreviewList(path);
                }
            });

            // 嵌套视图模型：渲染每个目录项的操作按钮组
            PuSet.ViewManager({
                target: title,
                selector: "button",
                data: option.options,
                layout(button, btnOption) {
                    // 同时设置按钮的文本内容和 value 属性
                    localization(btnOption.key, button, "textContent value");
                }
            }).on("click", function (event, value, key) {
                // 延迟执行按钮操作，确保 UI 更新不被阻塞
                setTimeout(() => value.exec(option, key), 0);
            });
        }
    });

    /**
     * 语言选择器视图模型
     * 根据 localization.locale 中的所有语言自动生成 <option> 元素
     */
    PuSet.ViewManager({
        target: document.getElementById("language"),
        template: '<option value=""></option>',       // 选项模板
        data: localization.locale,
        layout(elem, option, key) {
            elem.value = key;                         // option 值为语言代码
            elem.textContent = option.locale_name;    // 显示语言名称
            // 当前语言对应的选项设为选中状态
            if (key === localization.current) {
                elem.selected = true;
            }
        }
    }).target.addEventListener("change", function () {
        // 语言切换时调用 localization.set 触发全局刷新
        localization.set(this.value);
    });

    /**
     * 版本信息表格视图模型
     * 渲染版本行并从 C# 后端获取本地版本号
     */
    const versionViewModel = PuSet.ViewManager({
        target: applicationData.version.element.querySelector("tbody"),
        selector: "tr",
        data: applicationData.version.options,
        layout(tr, option) {
            const children = tr.querySelectorAll("td");
            // 第一列：组件名称（国际化）
            localization(option.key, children.item(0));

            // 异步获取本地可执行文件的版本号
            csharpHostObject.GetExeFileVersion(option.name).then(result => {
                option.version = parseVersionToFourPartArray(result);
                // 第二列：显示格式化后的本地版本号
                children.item(1).textContent = option.version.join(".");
            }).catch(result => {
                // 获取失败时显示错误提示
                localization("version_get_failed", children.item(1));
            });
        }
    });

    /**
     * 版本信息面板按钮事件处理
     * 使用事件委托监听 #version 容器内所有 button 的点击
     */
    PuSet("#version").on("click", "button", function () {
        switch (this.name) {
            case "version_open_in_explorer": {
                // 打开应用程序所在目录（空字符串表示应用自身目录）
                csharpHostObject.OpenInExplorer("");
                return;
            }
            case "version_check_for_updates": {
                // 检查所有组件的版本更新
                const trs = versionViewModel.target.querySelectorAll("tr");

                applicationData.version.options.forEach(async (option, i) => {
                    // 第三列为更新状态列
                    const td = trs.item(i).querySelectorAll("td").item(2);
                    // 请求 GitHub API 获取最新 release 信息
                    const response = await fetch(option.url);

                    if (!response.ok) {
                        localization("version_get_failed", td);
                        return;
                    }

                    const json = await response.json();
                    // 解析远程版本号（优先使用 tag_name，回退到 name）
                    const remoteVersion = parseVersionToFourPartArray(json.tag_name || json.name);
                    // 与本地版本比较
                    const compareResult = compareVersions(option.version, remoteVersion);

                    if (compareResult > 0) {
                        // 远程版本更新：创建下载链接
                        const link = document.createElement("a");
                        link.href = option.url;
                        localization("version_update_available", link);
                        td.innerHTML = "";
                        td.appendChild(link);
                    } else {
                        // 已是最新版本
                        localization("version_latest_version", td);
                    }
                });
            }
        }
    });
});