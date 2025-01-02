import { App, Plugin, TFolder, FuzzySuggestModal, FuzzyMatch } from 'obsidian';
import { pinyin } from 'pinyin-pro';

// 添加样式
const HIGHLIGHT_CLASS = 'folder-highlight';
const styles = `
.folder-highlight {
    background-color: var(--text-highlight-bg);
    transition: background-color 1s;
}
`;

export default class FolderLocatorPlugin extends Plugin {
    async onload() {
        // 添加样式
        const styleEl = document.createElement('style');
        styleEl.textContent = styles;
        document.head.appendChild(styleEl);

        this.addCommand({
            id: 'open-folder-search',
            name: '打开文件夹搜索',
            hotkeys: [{ modifiers: [], key: 'F2' }],
            callback: () => {
                new FolderSearchModal(this.app).open();
            }
        });
    }
}

class FolderSearchModal extends FuzzySuggestModal<TFolder> {
    constructor(app: App) {
        super(app);
        this.setPlaceholder("输入文件夹名称或拼音...");
        this.emptyStateText = "没有相关的文件夹";
    }

    getItems(): TFolder[] {
        const folders: TFolder[] = [];
        // @ts-ignore
        this.app.vault.getAllLoadedFiles().forEach((file) => {
            if (file instanceof TFolder) {
                folders.push(file);
            }
        });
        return folders;
    }

    getItemText(folder: TFolder): string {
        return folder.path;
    }

    // 获取拼音变体
    getPinyinVariants(text: string): string[] {
        const results: string[] = [];
        const words = text.split(/[\s\/\\]+/).filter(Boolean);
        
        words.forEach(word => {
            // 1. 原文
            results.push(word.toLowerCase());
            
            // 2. 全拼
            const fullPinyin = pinyin(word, { toneType: 'none' })
                .toLowerCase()
                .replace(/\s+/g, '');
            results.push(fullPinyin);
            
            // 3. 首字母
            const initials = pinyin(word, { pattern: 'first', toneType: 'none' })
                .toLowerCase()
                .replace(/\s+/g, '');
            results.push(initials);
            
            // 4. 分词首字母
            const chars = word.split('');
            const charPinyins = chars.map(char => 
                pinyin(char, { toneType: 'none' })[0] || ''
            );
            
            // 生成所有可能的首字母组合
            for (let len = 2; len <= chars.length; len++) {
                for (let i = 0; i <= chars.length - len; i++) {
                    const segment = charPinyins.slice(i, i + len);
                    const segmentInitials = segment.map(p => p[0] || '').join('');
                    if (segmentInitials) results.push(segmentInitials);
                }
            }
        });
        
        return [...new Set(results)].filter(Boolean);
    }

    // 高亮文件夹
    highlightFolder(el: HTMLElement) {
        el.addClass(HIGHLIGHT_CLASS);
        return new Promise<void>(resolve => {
            setTimeout(() => {
                el.removeClass(HIGHLIGHT_CLASS);
                resolve();
            }, 1000);
        });
    }

    // 展开并高亮父文件夹
    async expandAndHighlightParentFolders(fileExplorer: any, path: string) {
        const parts = path.split('/');
        let currentPath = '';
        
        // 依次展开并高亮每一级文件夹，但不包括最后一级
        for (let i = 0; i < parts.length; i++) {
            currentPath += (currentPath ? '/' : '') + parts[i];
            
            // 展开当前路径的文件夹
            // @ts-ignore
            await fileExplorer.revealInFolder(currentPath);
            
            // 确保文件夹被展开（只展开非最后一级）
            if (i < parts.length - 1) {
                // @ts-ignore
                const folderItem = fileExplorer.containerEl.querySelector(
                    `.nav-folder-title[data-path="${currentPath}"]`
                )?.parentElement;
                
                if (folderItem && folderItem.hasClass('is-collapsed')) {
                    // 手动触发展开
                    // @ts-ignore
                    const collapseIcon = folderItem.querySelector('.collapse-icon');
                    collapseIcon?.click();
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
            
            // 等待DOM更新
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // 高亮当前层级的文件夹
            // @ts-ignore
            const folderEl = fileExplorer.containerEl.querySelector(
                `[data-path="${currentPath}"]`
            ) as HTMLElement;
            
            if (folderEl) {
                folderEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await this.highlightFolder(folderEl);
                
                // 确保展开后的状态保持
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }
    }

    onChooseItem(folder: TFolder, evt: MouseEvent | KeyboardEvent): void {
        // @ts-ignore
        const fileExplorer = this.app.workspace.getLeavesOfType('file-explorer')[0]?.view;
        if (fileExplorer) {
            // 展开并高亮所有层级的文件夹
            this.expandAndHighlightParentFolders(fileExplorer, folder.path);
        }
    }

    renderSuggestion(match: FuzzyMatch<TFolder>, el: HTMLElement) {
        el.createEl("div", { text: match.item.path });
    }

    protected searchItems(query: string): FuzzyMatch<TFolder>[] {
        const folders = this.getItems();
        if (!query) {
            return folders.map(folder => ({ item: folder, match: {} as any }));
        }

        const queryVariants = this.getPinyinVariants(query);
        
        return folders
            .filter(folder => {
                const folderName = folder.path.split('/').pop() || '';
                const folderVariants = this.getPinyinVariants(folderName);
                
                // 检查任意变体是否匹配
                return queryVariants.some(qVar => 
                    folderVariants.some(fVar => 
                        fVar.includes(qVar) || qVar.includes(fVar)
                    )
                );
            })
            .map(folder => ({ item: folder, match: {} as any }));
    }
} 