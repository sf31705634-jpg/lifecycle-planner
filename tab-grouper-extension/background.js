const GROUP_COLORS = [
  "grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange",
];

function hashStringToIndex(str, modulo) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash % modulo;
}

function getDomain(url) {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== "http:" && protocol !== "https:") return null;
    return hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

async function groupTabsByDomain(windowId) {
  const [tabs, existingGroups] = await Promise.all([
    chrome.tabs.query({ windowId }),
    chrome.tabGroups.query({ windowId }),
  ]);

  const groupIdToTitle = new Map(existingGroups.map((g) => [g.id, g.title]));
  const titleToGroupId = new Map(
    existingGroups.filter((g) => g.title).map((g) => [g.title, g.id])
  );

  const domainToTabIds = new Map();
  for (const tab of tabs) {
    if (tab.pinned || !tab.url) continue;

    const domain = getDomain(tab.url);
    if (!domain) continue;

    // 既にグループに入っていて、それがこのドメイン用のグループでなければ触らない
    if (tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
      const currentTitle = groupIdToTitle.get(tab.groupId);
      if (currentTitle !== domain) continue;
    }

    if (!domainToTabIds.has(domain)) domainToTabIds.set(domain, []);
    domainToTabIds.get(domain).push(tab.id);
  }

  for (const [domain, tabIds] of domainToTabIds) {
    const existingGroupId = titleToGroupId.get(domain);
    // 単発タブで、まだ専用グループが無いなら作らずスキップ（ノイズ防止)
    if (tabIds.length < 2 && existingGroupId === undefined) continue;

    const groupId = await chrome.tabs.group({
      tabIds,
      ...(existingGroupId !== undefined
        ? { groupId: existingGroupId }
        : { createProperties: { windowId } }),
    });

    if (existingGroupId === undefined) {
      const color = GROUP_COLORS[hashStringToIndex(domain, GROUP_COLORS.length)];
      await chrome.tabGroups.update(groupId, { title: domain, color });
    }
  }
}

chrome.action.onClicked.addListener((tab) => {
  groupTabsByDomain(tab.windowId).catch((err) =>
    console.error("Tab Grouper by Domain: failed to group tabs", err)
  );
});
