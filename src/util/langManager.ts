import { error, success } from "./debug";

import { getStorage } from "./functions/asyncStorage";
import graphqlRequest from "./functions/graphql";

/**
 * Default language code
 */
export const DEFAULT_LOCALE = "en";

/**
 * Minimum time between strings update
 */
const MIN_UPDATE_TIME = 1000 * 60 * 5;

let languages: object = {};

function normalizeLanguageCode(languageCode: string): string {
	return languageCode.split("-")[0];
}

/**
 * Update strings values (extension and presence endpoints) from the API website
 *
 * @param languageCode language code following ISO639-1 spec
 */
export async function updateStrings(languageCode?: string) {
	if (!languageCode) languageCode = DEFAULT_LOCALE;
	if (
		!languageCode.includes("ja") &&
		!languageCode.includes("zh") &&
		!languageCode.includes("ko")
	)
		languageCode = normalizeLanguageCode(languageCode);

	let websiteLanguage: string = languageCode,
		extensionLanguage: string = languageCode,
		presenceLanguage: string = languageCode;

	switch (languageCode) {
		case "ja":
			websiteLanguage = "ja_JP";
			presenceLanguage = "ja_JP";
			break;
		case "ja_JP":
			extensionLanguage = "ja";
			break;
		case "ko":
			websiteLanguage = "ko_KR";
			presenceLanguage = "ko_KR";
			break;
		case "ko_KR":
			extensionLanguage = "ko";
			break;
		case "zh-CN":
			websiteLanguage = "zh_CN";
			presenceLanguage = "zh_CN";
			break;
		case "zh_CN":
			extensionLanguage = "zh-CN";
			break;
		case "zh-TW":
			websiteLanguage = "zh_TW";
			presenceLanguage = "zh_TW";
			break;
		case "zh_TW":
			extensionLanguage = "zh-TW";
			break;
		default:
			const responseLangs = await graphqlRequest(`
			query {
				langFiles(project: "extension") {
					lang
				}
			}
			`),
				availableLangs: string[] = responseLangs.data.langFiles.map(
					lf => lf.lang
				);

			if (!availableLangs.includes(extensionLanguage)) {
				const index = availableLangs.findIndex(c =>
					c.includes(extensionLanguage + "_")
				);
				if (index >= 0) {
					websiteLanguage = availableLangs[index];
					extensionLanguage = availableLangs[index];
					presenceLanguage = availableLangs[index];
				}
			}
			break;
	}

	try {
		const graphqlResult = await graphqlRequest(`
			query {
				website: langFiles(project: "website", lang: "${websiteLanguage}") {
					translations
				}
				extension: langFiles(project: "extension", lang: "${extensionLanguage}") {
					translations
				}
				presence: langFiles(project: "presence", lang: "${presenceLanguage}") {
					translations
				}
			}
		`);

		languages[languageCode] = {
			name: graphqlResult.data.website[0].translations["header.language"],
			loading:
				graphqlResult.data.website[0].translations["header.loader.phrases"],
			extension: graphqlResult.data.extension[0].translations,
			presence: graphqlResult.data.presence[0].translations,
			updatedAt: Date.now()
		};

		success("langManager.ts", `Updated ${languageCode} translations`);
	} catch (e) {
		error(
			"langManager.ts",
			`Error while fetching langFiles of ${languageCode} language: ${e.message}`
		);
		return;
	}

	if (languages[languageCode] && languages[languageCode].error) {
		languages[languageCode] = undefined;
		return;
	}

	await chrome.storage.local.set({ languages });
}

export async function updateAllStrings() {
	const languages = Object.keys((await getStorage("local", "languages")).languages);
	await Promise.all(
		languages.map(lng => loadStrings(lng, true))
	);
}

/**
 * Strings that are being loaded by loadStrings function
 */
const loadingLangs = [];

/**
 * Load the strings from the browser local storage, if they are not found in the storage they will be
 * fetch from the API.
 *
 * @param languageCode language code ISO639-1 if not specified DEFAULT_LOCALE is used
 * @param update boolean to force an update of the strings in the given locale
 */
export async function loadStrings(languageCode?: string, update?: boolean) {
	if (!languageCode) languageCode = DEFAULT_LOCALE;
	if (!update) update = false;
	languageCode = normalizeLanguageCode(languageCode);

	return new Promise<void>(resolve => {
		if (typeof languages[languageCode] !== "undefined") resolve();

		if (!loadingLangs.includes(languageCode)) {
			loadingLangs.push(languageCode);

			chrome.storage.local.get("languages", async lngs => {
				if (!lngs.languages) {
					lngs.languages = {};
				}

				const updatePromises = [];
				if (
					(
						update &&
						typeof lngs.languages[DEFAULT_LOCALE] !== "undefined" &&
						Date.now() - lngs.languages[DEFAULT_LOCALE].updatedAt >= MIN_UPDATE_TIME
					) ||
					(
						languageCode !== DEFAULT_LOCALE &&
						typeof lngs.languages[DEFAULT_LOCALE] === "undefined"
					)
				) {
					updatePromises.push(updateStrings(DEFAULT_LOCALE));
				}

				if (
					typeof lngs.languages[languageCode] === "undefined" ||
					(
						update &&
						// already checked if lngs.languages[languageCode] is undefined
						Date.now() - lngs.languages[languageCode].updatedAt >= MIN_UPDATE_TIME
					)

				) {
					updatePromises.push(updateStrings(languageCode));
				}

				await Promise.all(updatePromises);

				// merge all languages
				languages = { ...languages, ...lngs.languages };

				loadingLangs.splice(loadingLangs.indexOf(languageCode), 1);
				resolve();
			});
		} else {
			let loadStatus = setInterval(() => {
				if (
					typeof languages !== "undefined" &&
					typeof languages[languageCode] !== "undefined"
				) {
					clearInterval(loadStatus);
					resolve();
				}
			}, 5);
		}
	});
}

/**
 * Get all the translations in the given language and DEFAULT_LOCALE
 *
 * @param languageCode language code ISO639-1 if not specified DEFAULT_LOCALE is used
 */
export function getStrings(languageCode?: string) {
	if (!languageCode) languageCode = DEFAULT_LOCALE;
	languageCode = normalizeLanguageCode(languageCode);

	return new Promise(async resolve => {
		await loadStrings(languageCode);

		if (typeof languages[languageCode] === "undefined") {
			if (!languages[DEFAULT_LOCALE]) {
				resolve({});
			}

			resolve({
				[DEFAULT_LOCALE]: {
					...languages[DEFAULT_LOCALE].extension,
					...languages[DEFAULT_LOCALE].presence
				}
			});
		} else {
			resolve({
				[languageCode]: {
					...languages[languageCode].extension,
					...languages[languageCode].presence
				},
				[DEFAULT_LOCALE]: {
					...languages[DEFAULT_LOCALE].extension,
					...languages[DEFAULT_LOCALE].presence
				}
			});
		}
	});
}

/**
 * Get translation of a specific key
 *
 * @param string name of the string, to get the name of the language use "name" or "header.language"
 * @param languageCode language code ISO639-1 if not specified DEFAULT_LOCALE is used
 */
export function getString(string: string, languageCode?: string) {
	if (!languageCode) languageCode = chrome.i18n.getUILanguage();
	languageCode = normalizeLanguageCode(languageCode);

	return new Promise(async resolve => {
		await loadStrings(languageCode);

		if (typeof languages[languageCode] !== "undefined") {
			if (
				["name", "header.language"].includes(string) &&
				typeof languages[languageCode].name !== "undefined"
			) {
				return resolve(languages[languageCode].name);
			} else if (
				["loading", "header.loader.phrases"].includes(string) &&
				typeof languages[languageCode].loading !== "undefined"
			) {
				return resolve(languages[languageCode].loading);
			} else if (
				typeof languages[languageCode].extension !== "undefined" &&
				typeof languages[languageCode].extension[string] !== "undefined"
			) {
				return resolve(languages[languageCode].extension[string]);
			} else if (
				typeof languages[languageCode].presence !== "undefined" &&
				typeof languages[languageCode].presence[string] !== "undefined"
			) {
				return resolve(languages[languageCode].presence[string]);
			}
		}

		// prevent infinite loops
		if (languageCode === DEFAULT_LOCALE) {
			return resolve(string);
		}

		return resolve(await getString(string, DEFAULT_LOCALE));
	});
}

/**
 * Obtain all languages that are 100% translated for a presence and that also have the general file 100% translated
 *
 * @param presenceName name of the presence as specified in the "service" key of the metadata.json file
 */
export async function getPresenceLanguages(presenceName: string) {
	try {
		const langs = await graphqlRequest(`
			query {
				langFiles(presence: "${presenceName.toLowerCase()}") {
					lang
				}
				generalLangFiles: langFiles(presence: "general") {
					lang
				}
			}
		`);

		const finalArray = [];
		if (
			langs.data.langFiles.length > 0 &&
			langs.data.generalLangFiles.length > 0
		) {
			langs.data.generalLangFiles.forEach(lang => {
				const found = langs.data.langFiles.find(p => p.lang === lang.lang);
				if (found) finalArray.push(lang.lang);
			});
		} else if (langs.data.generalLangFiles.length > 0) {
			langs.data.generalLangFiles.forEach(lang => {
				finalArray.push(lang.lang);
			});
		}
		return finalArray;
	} catch (e) {
		return [];
	}
}
