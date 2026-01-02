/**
 * 快捷方式管理器
 * 提供通用的快捷方式固定/取消固定功能，供各个应用模块使用
 */

const ShortcutManager = {
    /**
     * 检查某个快捷方式是否已固定
     * @param {string} type - 快捷方式类型（如 'datalens', 'analysis', 'blog' 等）
     * @param {string|number} identifier - 唯一标识符（如 view_id, post_id 等）
     * @returns {boolean} 是否已固定
     */
    isPinned(type, identifier) {
        const user = Store.get('user');
        const shortcuts = user?.settings?.start_menu_shortcuts || [];
        
        return shortcuts.some(s => 
            s.type === type && 
            (s.view_id === identifier || 
             s.post_id === identifier || 
             s.item_id === identifier ||
             s.id === identifier)
        );
    },

    /**
     * 固定快捷方式到开始菜单
     * @param {Object} options - 快捷方式配置
     * @param {string} options.type - 快捷方式类型（必需）
     * @param {string|number} options.identifier - 唯一标识符（必需）
     * @param {string} options.name - 显示名称（必需）
     * @param {string} options.path - 跳转路径（必需）
     * @param {string} options.icon - 图标（可选，默认 '🔗'）
     * @param {Object} options.metadata - 额外元数据（可选）
     * @returns {Promise<boolean>} 是否成功
     */
    async pinShortcut(options) {
        const { type, identifier, name, path, icon = '🔗', metadata = {} } = options;

        if (!type || identifier === undefined || !name || !path) {
            Toast.error('快捷方式配置不完整');
            return false;
        }

        try {
            const user = Store.get('user');
            if (!user) {
                Toast.error('请先登录');
                return false;
            }

            let shortcuts = user.settings?.start_menu_shortcuts || [];
            if (!Array.isArray(shortcuts)) shortcuts = [];

            // 检查是否已存在
            const exists = shortcuts.some(s => {
                if (s.type !== type) return false;
                return s.view_id === identifier || 
                       s.post_id === identifier || 
                       s.item_id === identifier ||
                       s.id === identifier;
            });

            if (exists) {
                Toast.info('该快捷方式已存在');
                return true;
            }

            // 生成唯一 ID
            const id = `${type}_${identifier}`;

            // 构建快捷方式对象
            const shortcut = {
                id,
                name,
                icon,
                path,
                type,
                ...metadata,
                // 根据类型设置对应的 ID 字段
                ...(type === 'datalens' ? { view_id: identifier } : {}),
                ...(type === 'blog' ? { post_id: identifier } : {}),
                ...(type === 'analysis' ? { dataset_id: identifier } : {}),
                ...(!['datalens', 'blog', 'analysis'].includes(type) ? { item_id: identifier } : {})
            };

            shortcuts.push(shortcut);

            // 更新本地 Store
            const newSettings = {
                ...(user.settings || {}),
                start_menu_shortcuts: shortcuts
            };
            const updatedUser = { ...user, settings: newSettings };
            Store.set('user', updatedUser);

            // 同步到后端，并使用后端返回的数据更新 Store（确保持久化）
            if (window.UserApi) {
                try {
                    const res = await UserApi.updateProfile({ settings: newSettings });
                    // 使用后端返回的数据更新 Store，确保数据一致性
                    if (res && res.data) {
                        const backendUser = res.data;
                        if (backendUser.settings && backendUser.settings.start_menu_shortcuts) {
                            const finalSettings = {
                                ...(updatedUser.settings || {}),
                                start_menu_shortcuts: backendUser.settings.start_menu_shortcuts
                            };
                            Store.set('user', { ...updatedUser, settings: finalSettings });
                        }
                    }
                } catch (err) {
                    console.error('[ShortcutManager] 同步到后端失败:', err);
                    // 即使后端同步失败，也保持本地更新，避免用户体验问题
                }
            }

            Toast.success('已固定到开始菜单');
            return true;

        } catch (e) {
            console.error('[ShortcutManager] 固定快捷方式失败:', e);
            Toast.error('操作失败: ' + (e.message || '未知错误'));
            return false;
        }
    },

    /**
     * 取消固定快捷方式
     * @param {string} type - 快捷方式类型
     * @param {string|number} identifier - 唯一标识符
     * @returns {Promise<boolean>} 是否成功
     */
    async unpinShortcut(type, identifier) {
        if (!type || identifier === undefined) {
            Toast.error('参数不完整');
            return false;
        }

        try {
            const user = Store.get('user');
            if (!user) {
                Toast.error('请先登录');
                return false;
            }

            let shortcuts = user.settings?.start_menu_shortcuts || [];
            if (!Array.isArray(shortcuts)) shortcuts = [];

            // 过滤掉匹配的快捷方式
            const beforeLength = shortcuts.length;
            shortcuts = shortcuts.filter(s => {
                if (s.type !== type) return true;
                return !(s.view_id === identifier || 
                        s.post_id === identifier || 
                        s.item_id === identifier ||
                        s.id === identifier);
            });

            if (shortcuts.length === beforeLength) {
                Toast.info('该快捷方式不存在');
                return true;
            }

            // 更新本地 Store
            const newSettings = {
                ...(user.settings || {}),
                start_menu_shortcuts: shortcuts
            };
            const updatedUser = { ...user, settings: newSettings };
            Store.set('user', updatedUser);

            // 同步到后端，并使用后端返回的数据更新 Store（确保持久化）
            if (window.UserApi) {
                try {
                    const res = await UserApi.updateProfile({ settings: newSettings });
                    // 使用后端返回的数据更新 Store，确保数据一致性
                    if (res && res.data) {
                        const backendUser = res.data;
                        if (backendUser.settings && backendUser.settings.start_menu_shortcuts) {
                            const finalSettings = {
                                ...(updatedUser.settings || {}),
                                start_menu_shortcuts: backendUser.settings.start_menu_shortcuts
                            };
                            Store.set('user', { ...updatedUser, settings: finalSettings });
                        }
                    }
                } catch (err) {
                    console.error('[ShortcutManager] 同步到后端失败:', err);
                    // 即使后端同步失败，也保持本地更新，避免用户体验问题
                }
            }

            Toast.success('已从开始菜单移除');
            return true;

        } catch (e) {
            console.error('[ShortcutManager] 取消固定快捷方式失败:', e);
            Toast.error('操作失败: ' + (e.message || '未知错误'));
            return false;
        }
    },

    /**
     * 切换快捷方式的固定状态
     * @param {Object} options - 快捷方式配置（同 pinShortcut）
     * @returns {Promise<boolean>} 操作后的固定状态（true=已固定，false=未固定）
     */
    async toggleShortcut(options) {
        const { type, identifier } = options;
        const isPinned = this.isPinned(type, identifier);

        if (isPinned) {
            await this.unpinShortcut(type, identifier);
            return false;
        } else {
            await this.pinShortcut(options);
            return true;
        }
    },

    /**
     * 获取所有已固定的快捷方式
     * @param {string} type - 可选，过滤特定类型
     * @returns {Array} 快捷方式列表
     */
    getShortcuts(type = null) {
        const user = Store.get('user');
        const shortcuts = user?.settings?.start_menu_shortcuts || [];
        
        if (type) {
            return shortcuts.filter(s => s.type === type);
        }
        
        return shortcuts;
    },

    /**
     * 清理无效的快捷方式（例如被删除的资源）
     * @param {string} type - 快捷方式类型
     * @param {Array<number>} validIds - 有效的标识符列表
     * @returns {Promise<number>} 清理的数量
     */
    async cleanupInvalidShortcuts(type, validIds) {
        try {
            const user = Store.get('user');
            if (!user) return 0;

            let shortcuts = user.settings?.start_menu_shortcuts || [];
            if (!Array.isArray(shortcuts)) shortcuts = [];

            const validIdSet = new Set(validIds);
            const beforeLength = shortcuts.length;

            shortcuts = shortcuts.filter(s => {
                if (s.type !== type) return true;
                const id = s.view_id || s.post_id || s.item_id || s.id;
                return validIdSet.has(id);
            });

            const cleanedCount = beforeLength - shortcuts.length;

            if (cleanedCount > 0) {
                const newSettings = {
                    ...(user.settings || {}),
                    start_menu_shortcuts: shortcuts
                };
                const updatedUser = { ...user, settings: newSettings };
                Store.set('user', updatedUser);

                if (window.UserApi) {
                    await UserApi.updateProfile({ settings: newSettings });
                }
            }

            return cleanedCount;

        } catch (e) {
            console.error('[ShortcutManager] 清理无效快捷方式失败:', e);
            return 0;
        }
    }
};

// 暴露到全局
window.ShortcutManager = ShortcutManager;

