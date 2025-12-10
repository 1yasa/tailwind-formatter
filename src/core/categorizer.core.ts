/**
 * core/categorizer.core.ts
 *
 * Categorizer for organizing Tailwind CSS classes into categories. Handles separate,
 * separate-categorized, and inline viewport grouping modes.
 */

import { PrefixInfo, ClassParseResult, FormatterConfig } from "../types";

// 扩展 FormatterConfig 类型定义以便在当前文件使用 printWidth
// 实际项目中请确保 types.ts 中已有 printWidth 定义
type ExtendedFormatterConfig = FormatterConfig & {
      printWidth?: number;
};

/**
 * Categorizes classes and viewports according to viewport grouping configuration.
 * Handles both separate and inline viewport grouping modes.
 */
export function categorizeClassesAndViewports(
      parsedClasses: ClassParseResult,
      formatterConfig: ExtendedFormatterConfig
): string[] {
      switch (formatterConfig.viewportGrouping) {
            case "separate":
                  return categorizeSeparateMode(parsedClasses, formatterConfig);
            case "separate-categorized":
                  return categorizeSeparateCategorizedMode(parsedClasses, formatterConfig);
            case "inline":
                  return categorizeInlineMode(parsedClasses, formatterConfig);
            default:
                  return [];
      }
}

function categorizeSeparateMode(
      parsedClasses: ClassParseResult,
      formatterConfig: ExtendedFormatterConfig,
      categorized: boolean = false
): string[] {
      const categorizedResult: string[] = [];

      const baseClassCategories = categorizeTailwindClasses(
            parsedClasses.baseClasses,
            formatterConfig
      );

      if (baseClassCategories) {
            categorizedResult.push(...baseClassCategories);
      }

      formatterConfig.viewports.forEach((viewport) => {
            if (parsedClasses.viewportClasses[viewport]?.length > 0) {
                  const prefixedClasses = parsedClasses.viewportClasses[viewport].map(
                        (cls) => `${viewport}:${cls}`
                  );

                  const viewportCategories = categorizeTailwindClasses(
                        prefixedClasses,
                        formatterConfig
                  );

                  if (viewportCategories.length > 0) {
                        if (categorized) {
                              categorizedResult.push(...viewportCategories);
                        } else {
                              categorizedResult.push(viewportCategories.join(" "));
                        }
                  }
            }
      });

      return categorizedResult;
}

function categorizeSeparateCategorizedMode(
      parsedClasses: ClassParseResult,
      formatterConfig: ExtendedFormatterConfig
): string[] {
      return categorizeSeparateMode(parsedClasses, formatterConfig, true);
}

function categorizeInlineMode(
      parsedClasses: ClassParseResult,
      formatterConfig: ExtendedFormatterConfig
): string[] {
      const allClasses: string[] = [...parsedClasses.baseClasses];

      formatterConfig.viewports.forEach((viewport) => {
            if (parsedClasses.viewportClasses[viewport]?.length > 0) {
                  allClasses.push(
                        ...parsedClasses.viewportClasses[viewport].map(
                              (cls) => `${viewport}:${cls}`
                        )
                  );
            }
      });

      return categorizeTailwindClasses(allClasses, formatterConfig);
}

/**
 * Categorizes Tailwind CSS classes into groups based on their prefixes.
 * Supports wildcard prefixes (e.g., 'group*') and dynamic wrapping based on printWidth.
 */
export function categorizeTailwindClasses(
      classes: string[],
      formatterConfig: ExtendedFormatterConfig
): string[] {
      const { categories, viewports, uncategorizedPosition, printWidth = 80 } = formatterConfig;

      // 结构：Category -> Prefix -> Classes[]
      // 使用 Map 保持插入顺序（在 categories config 中定义的顺序）
      const categorizedGroups: Record<string, Map<string, string[]>> = {};
      const uncategorized: string[] = [];

      if (classes.length === 0 || Object.keys(categories).length === 0) {
            return [];
      }

      /* Initialize map */
      Object.keys(categories).forEach((category) => {
            categorizedGroups[category] = new Map();
      });

      /* Map for all prefixes */
      const allPrefixes: PrefixInfo[] = [];

      Object.entries(categories).forEach(([category, prefixesString]) => {
            const prefixes = prefixesString.split(" ");
            prefixes.forEach((rawPrefix) => {
                  // FIX: 支持 group* 语法
                  const isWildcard = rawPrefix.endsWith("*");
                  const prefix = isWildcard ? rawPrefix.slice(0, -1) : rawPrefix;

                  // 记录前缀属于哪个分类，以及它的原始定义（用于后续分组排序）
                  allPrefixes.push({
                        category,
                        prefix,
                        length: prefix.length,
                  });

                  // 初始化该分类下的该前缀组
                  // 注意：这里使用 rawPrefix 作为 key 以区分配置中的不同条目，
                  // 但实际存储时可能需要根据匹配到的结果来归类。
                  // 为了简单，我们使用定义的 prefix 字符串作为 group key。
                  if (!categorizedGroups[category].has(rawPrefix)) {
                        categorizedGroups[category].set(rawPrefix, []);
                  }
            });
      });

      /* Sort prefixes by length in descending order (most specific first) */
      allPrefixes.sort((a, b) => b.length - a.length);

      /* Process each class */
      classes.forEach((cls) => {
            let matched = false;
            let classToCheck = cls;

            /* Handle viewport prefixes for matching logic */
            const viewportPrefix = viewports.find((vp) => cls.startsWith(`${vp}:`));
            if (viewportPrefix) {
                  classToCheck = cls.substring(viewportPrefix.length + 1);
            }

            const classBeforeInterpolation = classToCheck.split("${")[0];

            /* Find the most specific match */
            for (const { category, prefix, prefix: matcherPrefix } of allPrefixes) {
                  // matcherPrefix is the clean version
                  // 注意：allPrefixes 里的 prefix 已经是去掉了 * 的
                  // 如果配置是 group*，这里 prefix 是 group。
                  // class group-hover 匹配 group (Starts with) -> 成功
                  if (classBeforeInterpolation.startsWith(prefix)) {
                        // 找到对应的原始配置key (可能是 group* 也可能是 group)
                        // 为了正确分组，我们需要找到这个 category 下对应的 Key
                        // 这里简化逻辑：我们直接遍历该 Category 下所有的 Keys 找到对应的那个
                        // 因为我们上面 sort 了 allPrefixes，这里直接用当前的即可

                        // 实际上，我们需要知道这个 prefix 对应 categorizedGroups[category] 里的哪个 Key。
                        // 由于上面 allPrefixes 扁平化了，我们通过 category 和 prefix 找回对应的 Key 比较麻烦。
                        // 简单的做法：在 allPrefixes 里多存一个 originalKey。

                        // 重新查找对应的 originalKey (包含 * 的那个)
                        const entries = Object.entries(categories).find(([c]) => c === category);
                        if (entries) {
                              const rawPrefixes = entries[1].split(" ");
                              // 找到包含这个 clean prefix 的 raw prefix
                              const targetRaw = rawPrefixes.find(
                                    (r) =>
                                          r === prefix ||
                                          (r.endsWith("*") && r.slice(0, -1) === prefix)
                              );

                              if (targetRaw) {
                                    const group = categorizedGroups[category].get(targetRaw);
                                    if (group) {
                                          group.push(cls);
                                          matched = true;
                                    }
                              }
                        }
                        break;
                  }
            }

            if (!matched) {
                  uncategorized.push(cls);
            }
      });

      /* Formatting and Line Wrapping Logic */
      const resultLines: string[] = [];

      // 按 categories 配置的顺序处理
      Object.keys(categories).forEach((category) => {
            const groupsMap = categorizedGroups[category];
            const groups: string[][] = [];

            // 收集该 Category 下所有非空的 Group
            // Map 的遍历顺序即为插入顺序 (categories 里的定义顺序)
            groupsMap.forEach((groupClasses) => {
                  if (groupClasses.length > 0) {
                        groups.push(groupClasses);
                  }
            });

            if (groups.length > 0) {
                  // 将收集到的 Groups 进行换行处理
                  const categoryLines = formatCategoryLines(groups, printWidth);
                  resultLines.push(...categoryLines);
            }
      });

      const uncategorizedString = uncategorized.join(" ");

      if (uncategorizedPosition === "beforeCategorized" && uncategorizedString) {
            return [uncategorizedString, ...resultLines];
      } else if (uncategorizedString) {
            return [...resultLines, uncategorizedString];
      }

      return resultLines;
}

/**
 * Helper function to format groups into lines respecting printWidth.
 *
 * Logic:
 * 1. Try to fit all remaining groups on the current line.
 * 2. If it exceeds printWidth:
 *    - Remove the last group.
 *    - Check again.
 *    - Repeat until it fits OR only 1 group remains.
 * 3. Push the fitted line to results.
 * 4. Repeat for the remaining groups.
 */
function formatCategoryLines(groups: string[][], printWidth: number): string[] {
      const lines: string[] = [];
      let remainingGroups = [...groups];

      while (remainingGroups.length > 0) {
            let currentLineGroups = [...remainingGroups];
            let currentLineString = currentLineGroups.map((g) => g.join(" ")).join(" ");

            // 如果当前行超出宽度，且不止一个 Group，则尝试减少 Group
            while (currentLineString.length > printWidth && currentLineGroups.length > 1) {
                  // 移除最后一个 Group (它将被留到下一行处理)
                  currentLineGroups.pop();
                  currentLineString = currentLineGroups.map((g) => g.join(" ")).join(" ");
            }

            // 此时 currentLineGroups 包含了能放下的 Groups (或者虽然放不下但仅剩的一个 Group)
            lines.push(currentLineString);

            // 从待处理列表中移除已处理的 Groups
            remainingGroups = remainingGroups.slice(currentLineGroups.length);
      }

      return lines;
}
