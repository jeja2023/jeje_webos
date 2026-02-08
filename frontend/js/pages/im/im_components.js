/**
 * IM 辅助 UI 组件库
 * 提供成员选择、群设置等弹窗逻辑
 */
const IMComponents = {
    /**
     * 显示成员选择器
     * @param {Object} options 
     * @param {string} options.title 标题
     * @param {boolean} options.multiSelect 是否多选
     * @param {Array} options.excludeIds 排除的用户ID
     */
    showMemberSelector(options = {}) {
        const { title = '选择成员', multiSelect = true, excludeIds = [] } = options;

        return new Promise((resolve) => {
            let selectedUsers = new Map();
            let lastResults = [];

            const { overlay, close } = Modal.show({
                title: title,
                width: '450px',
                content: `
                    <div class="im-member-selector">
                        <div class="im-search-bar" style="margin-bottom: 12px; position: relative;">
                            <i class="ri-search-line" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--color-text-tertiary);"></i>
                            <input type="text" id="memberSearchInput" class="form-input" 
                                   placeholder="输入用户名或昵称搜索..." 
                                   style="width: 100%; height: 40px; border-radius: 20px; padding: 0 12px 0 36px; background: var(--color-bg-tertiary); border: none;">
                        </div>
                        <div class="im-member-list-container" style="max-height: 320px; overflow-y: auto; padding: 4px;">
                            <div id="memberListResults">
                                <div style="text-align:center;padding:40px;color:var(--color-text-tertiary)">输入关键字开始搜索</div>
                            </div>
                        </div>
                        <div class="im-selected-bar" style="margin-top: 12px; padding: 12px; border-top: 1px solid var(--color-border); display: ${multiSelect ? 'block' : 'none'}">
                            <div style="font-size: 13px; font-weight: 500; margin-bottom: 8px;">
                                已选择: <span id="selectedCount" style="color: var(--color-primary)">0</span>
                            </div>
                            <div id="selectedChips" style="display: flex; flex-wrap: wrap; gap: 8px; max-height: 80px; overflow-y: auto;"></div>
                        </div>
                    </div>
                `,
                showCancel: true,
                confirmText: multiSelect ? '确定创建' : '选择',
                onConfirm: () => {
                    if (multiSelect) {
                        if (selectedUsers.size === 0) {
                            Toast.warning('请至少选择一个成员');
                            return false;
                        }
                        resolve(Array.from(selectedUsers.keys()));
                        return true;
                    }
                    return true;
                },
                onCancel: () => resolve(null)
            });

            const input = overlay.querySelector('#memberSearchInput');
            const resultsDiv = overlay.querySelector('#memberListResults');
            const selectedChips = overlay.querySelector('#selectedChips');
            const selectedCount = overlay.querySelector('#selectedCount');

            let searchTimer = null;

            const updateSelectedUI = () => {
                if (!multiSelect) return;
                selectedCount.textContent = selectedUsers.size;
                selectedChips.innerHTML = Array.from(selectedUsers.values()).map(user => `
                    <div class="im-user-chip" style="display: flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 16px; background: var(--color-primary-light); color: var(--color-primary); font-size: 12px;">
                        <span>${this.escapeHtml(user.name)}</span>
                        <i class="ri-close-circle-fill" style="cursor:pointer; font-size: 14px; opacity: 0.8;" data-id="${this.escapeHtml(String(user.id))}"></i>
                    </div>
                `).join('');

                // 绑定删除事件
                selectedChips.querySelectorAll('i').forEach(i => {
                    i.onclick = (e) => {
                        e.stopPropagation();
                        const id = parseInt(i.dataset.id);
                        selectedUsers.delete(id);
                        updateSelectedUI();
                        renderResults(lastResults);
                    };
                });
            };

            const renderResults = (users) => {
                lastResults = users;
                if (!users || users.length === 0) {
                    resultsDiv.innerHTML = '<div style="text-align:center;padding:40px;color:var(--color-text-tertiary)">未找到匹配用户</div>';
                    return;
                }

                resultsDiv.innerHTML = users.map(user => {
                    const isSelected = selectedUsers.has(user.id);
                    const isExcluded = excludeIds.includes(user.id);
                    return `
                        <div class="im-selector-item ${isExcluded ? 'disabled' : ''}" data-id="${this.escapeHtml(String(user.id))}" 
                             style="display: flex; align-items: center; padding: 10px; cursor: ${isExcluded ? 'not-allowed' : 'pointer'}; border-radius: 10px; margin-bottom: 2px; transition: background 0.2s;">
                            <div style="width: 38px; height: 38px; border-radius: 50%; background: var(--color-bg-secondary); margin-right: 12px; display: flex; align-items: center; justify-content: center; overflow: hidden; border: 1px solid var(--color-border);">
                                ${user.avatar && !/^\s*(javascript|vbscript|data):/i.test(user.avatar) ? `<img src="${this.escapeHtml(user.avatar)}" style="width:100%;height:100%;object-fit:cover">` : '<i class="ri-user-line" style="color:var(--color-text-tertiary)"></i>'}
                            </div>
                            <div style="flex:1">
                                <div style="font-weight: 500">${this.escapeHtml(user.nickname || user.username)}</div>
                                <div style="font-size: 11px; color: var(--color-text-tertiary)">@${this.escapeHtml(user.username)}</div>
                            </div>
                            ${multiSelect ? `
                                <div class="im-checkbox ${isSelected ? 'checked' : ''}" style="width: 20px; height: 20px; border: 2px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: ${isSelected ? 'var(--color-primary)' : 'transparent'}; transition: all 0.2s;">
                                    ${isSelected ? '<i class="ri-check-line" style="color:white; font-size:14px"></i>' : ''}
                                </div>
                            ` : '<i class="ri-arrow-right-s-line" style="color:var(--color-text-tertiary)"></i>'}
                        </div>
                    `;
                }).join('');

                resultsDiv.querySelectorAll('.im-selector-item').forEach(el => {
                    if (el.classList.contains('disabled')) return;

                    el.onmouseover = () => el.style.background = 'var(--color-bg-hover)';
                    el.onmouseout = () => el.style.background = 'transparent';

                    el.onclick = () => {
                        const id = parseInt(el.dataset.id);
                        const user = users.find(u => u.id === id);

                        if (!multiSelect) {
                            resolve([id]);
                            close();
                            return;
                        }

                        if (selectedUsers.has(id)) {
                            selectedUsers.delete(id);
                        } else {
                            if (selectedUsers.size >= 50) {
                                Toast.warning('单次建群最多选择50人');
                                return;
                            }
                            selectedUsers.set(id, { id, name: user.nickname || user.username });
                        }
                        updateSelectedUI();
                        renderResults(users);
                    };
                });
            };

            input.oninput = () => {
                if (searchTimer) clearTimeout(searchTimer);
                const query = input.value.trim();
                if (!query) { resultsDiv.innerHTML = '<div style="text-align:center;padding:40px;color:var(--color-text-tertiary)">输入关键字开始搜索</div>'; return; }

                searchTimer = setTimeout(async () => {
                    resultsDiv.innerHTML = '<div style="text-align:center;padding:40px;"><i class="ri-loader-4-line spin"></i> 搜索中...</div>';
                    try {
                        const res = await Api.get('/users/search', { query: query });
                        if (res.code === 200 || res.code === 0) {
                            renderResults(Array.isArray(res.data) ? res.data : (res.data.items || []));
                        } else {
                            resultsDiv.innerHTML = `<div style="text-align:center;padding:40px;color:var(--color-error)">${this.escapeHtml(res.message)}</div>`;
                        }
                    } catch (e) {
                        resultsDiv.innerHTML = '<div style="text-align:center;padding:40px;color:var(--color-error)">接口请求失败</div>';
                    }
                }, 400);
            };

            setTimeout(() => input.focus(), 200);
        });
    },

    /**
     * 显示群设置面板
     */
    async showGroupSettings(conversation, currentUser, actions = {}) {
        const { onAddMember, onRemoveMember, onUpdateInfo, onDelete, onClearHistory } = actions;
        const isOwner = conversation.owner_id === currentUser.id;

        const { overlay, close } = Modal.show({
            title: '群聊信息',
            width: '500px',
            content: `
                <div class="im-group-settings">
                    <div class="im-group-info-card" style="display: flex; align-items: center; gap: 16px; padding: 16px; background: var(--color-bg-tertiary); border-radius: 12px; margin-bottom: 20px;">
                        <div class="im-group-avatar-wrapper" style="position: relative; cursor: ${isOwner ? 'pointer' : 'default'}">
                            <div style="width: 64px; height: 64px; border-radius: 16px; background: var(--color-primary-light); color: var(--color-primary); display: flex; align-items: center; justify-content: center; font-size: 32px; overflow: hidden">
                                ${conversation.avatar && !/^\s*(javascript|vbscript|data):/i.test(conversation.avatar) ? `<img src="${this.escapeHtml(conversation.avatar)}" style="width:100%;height:100%;object-fit:cover">` : '<i class="ri-group-line"></i>'}
                            </div>
                            ${isOwner ? '<div style="position: absolute; right: -4px; bottom: -4px; width: 22px; height: 22px; background: var(--color-primary); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; border: 2px solid white;"><i class="ri-edit-2-fill"></i></div>' : ''}
                        </div>
                        <div style="flex: 1">
                            ${isOwner ? `
                                <input type="text" id="groupNameInput" class="form-input" value="${this.escapeHtml(conversation.name || '')}" 
                                       placeholder="点击输入群名称" style="font-size: 18px; font-weight: 600; background: transparent; border: none; padding: 0; width: 100%">
                            ` : `
                                <div style="font-size: 18px; font-weight: 600">${this.escapeHtml(conversation.name || '未命名群聊')}</div>
                            `}
                            <div style="font-size: 12px; color: var(--color-text-tertiary); margin-top: 4px;">由 ${this.escapeHtml(conversation.owner_nickname || '管理员')} 创建于 ${new Date(conversation.created_at).toLocaleDateString()}</div>
                        </div>
                    </div>

                    <div class="im-section-title" style="font-size: 14px; font-weight: 600; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
                        <span>成员列表 (${conversation.members?.length || 0})</span>
                        <button class="btn-text" id="btnAddMember" style="color: var(--color-primary); font-size: 13px; font-weight: 500;">
                            <i class="ri-user-add-line"></i> 邀请新成员
                        </button>
                    </div>

                    <div class="im-group-members-grid" style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; max-height: 240px; overflow-y: auto; padding: 4px;">
                        ${(conversation.members || []).map(member => `
                            <div class="im-member-card" style="text-align: center; position: relative;">
                                <div style="width: 42px; height: 42px; border-radius: 50%; background: var(--color-bg-secondary); margin: 0 auto 6px; display: flex; align-items: center; justify-content: center; overflow: hidden; border: 1px solid var(--color-border);">
                                    ${member.avatar && !/^\s*(javascript|vbscript|data):/i.test(member.avatar) ? `<img src="${this.escapeHtml(member.avatar)}" style="width:100%;height:100%;object-fit:cover">` : '<i class="ri-user-line" style="color:var(--color-text-tertiary)"></i>'}
                                </div>
                                <div style="font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 0 4px;">
                                    ${this.escapeHtml(member.nickname || member.username)}
                                </div>
                                ${member.role === 'owner' ? '<div style="font-size: 10px; color: var(--color-warning); transform: scale(0.8)">群主</div>' : ''}
                                ${isOwner && member.user_id !== currentUser.id ? `
                                    <div class="btn-remove-member" data-id="${this.escapeHtml(String(member.user_id))}" 
                                         style="position: absolute; top: -5px; right: 0; color: var(--color-error); cursor: pointer; background: white; border-radius: 50%; width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; font-size: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1)">
                                        <i class="ri-close-line"></i>
                                    </div>
                                ` : ''}
                            </div>
                        `).join('')}
                    </div>

                    <div style="margin-top: 24px; display: flex; flex-direction: column; gap: 8px;">
                        <div style="display: flex; gap: 12px;">
                            <button class="btn-secondary btn-block" id="btnClearHistory" style="flex: 1">
                                <i class="ri-delete-bin-line"></i> 清空记录
                            </button>
                            ${isOwner ? `
                            <button class="btn-primary" id="btnSaveGroupInfo" style="padding: 0 24px;">保存修改</button>
                            ` : ''}
                        </div>
                        <button class="btn-danger btn-block" id="btnExitGroup">
                            <i class="ri-logout-box-r-line"></i> ${isOwner ? '解散群聊' : '退出群聊'}
                        </button>
                    </div>
                </div>
            `,
            showCancel: false,
            confirmText: '关闭',
            onConfirm: () => true
        });

        // 绑定事件
        overlay.querySelector('#btnAddMember').onclick = () => onAddMember();
        overlay.querySelector('#btnClearHistory').onclick = () => {
            if (confirm('确定要清空该会话的本地聊天记录吗？')) {
                onClearHistory && onClearHistory();
                close();
            }
        };

        if (isOwner) {
            overlay.querySelector('#btnSaveGroupInfo').onclick = () => {
                const name = overlay.querySelector('#groupNameInput').value.trim();
                if (!name) return Toast.warning('群名称不能为空');
                onUpdateInfo({ name });
                close();
            };

            overlay.querySelectorAll('.btn-remove-member').forEach(btn => {
                btn.onclick = () => {
                    const id = parseInt(btn.dataset.id);
                    onRemoveMember(id);
                    btn.closest('.im-member-card').style.opacity = '0.3';
                    btn.closest('.im-member-card').style.pointerEvents = 'none';
                };
            });
        }

        overlay.querySelector('#btnExitGroup').onclick = () => {
            const actionText = isOwner ? '解散' : '退出';
            Modal.confirm({
                title: '确认操作',
                content: `确定要${actionText}该群聊吗？${isOwner ? '解散后所有成员将被移出且聊天记录不可找回。' : ''}`,
                onConfirm: () => {
                    onDelete();
                    close();
                }
            });
        };
    },

    /**
     * 显示私聊设置面板
     */
    showPrivateSettings(conversation, currentUser, actions = {}) {
        const { onDelete, onClearHistory } = actions;

        // 获取对方信息 (成员列表中排除自己)
        const otherMember = (conversation.members || []).find(m => m.user_id !== currentUser.id) || conversation;

        const { overlay, close } = Modal.show({
            title: '联系人信息',
            width: '400px',
            content: `
                <div class="im-private-settings" style="text-align: center; padding: 10px 0;">
                    <div style="width: 80px; height: 80px; border-radius: 50%; background: var(--color-bg-tertiary); margin: 0 auto 16px; display: flex; align-items: center; justify-content: center; overflow: hidden; border: 2px solid var(--color-primary-light);">
                        ${otherMember.avatar && !/^\s*(javascript|vbscript|data):/i.test(otherMember.avatar) ? `<img src="${this.escapeHtml(otherMember.avatar)}" style="width:100%;height:100%;object-fit:cover">` : '<i class="ri-user-line" style="font-size: 40px; color: var(--color-text-tertiary)"></i>'}
                    </div>
                    <div style="font-size: 20px; font-weight: 600; margin-bottom: 4px;">${this.escapeHtml(otherMember.nickname || otherMember.username)}</div>
                    <div style="font-size: 13px; color: var(--color-text-tertiary); margin-bottom: 24px;">@${this.escapeHtml(otherMember.username)}</div>
                    
                    <div style="display: flex; flex-direction: column; gap: 10px; padding-top: 16px; border-top: 1px solid var(--color-border);">
                        <button class="btn-secondary" id="btnClearHistory" style="width: 100%; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; gap: 8px;">
                            <i class="ri-history-line"></i> 清空本地聊天记录
                        </button>
                        <button class="btn-danger" id="btnDeleteConversation" style="width: 100%; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; gap: 8px;">
                            <i class="ri-delete-bin-line"></i> 删除该联系人会话
                        </button>
                    </div>
                </div>
            `,
            showCancel: false,
            confirmText: '关闭',
            onConfirm: () => true
        });

        overlay.querySelector('#btnClearHistory').onclick = () => {
            if (confirm('确定要清空与该联系人的本地聊天记录吗？此操作不可逆。')) {
                onClearHistory && onClearHistory();
                close();
            }
        };

        overlay.querySelector('#btnDeleteConversation').onclick = () => {
            if (confirm('确定要删除该会话吗？删除后列表将不再显示，但之前的记录重新开始聊天时可能会恢复（取决于服务端配置）。')) {
                onDelete && onDelete();
                close();
            }
        };
    },

    escapeHtml(text) {
        if (!text) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
};
