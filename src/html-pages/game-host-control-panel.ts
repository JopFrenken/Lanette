import type { Room } from "../rooms";
import type { BaseCommandDefinitions } from "../types/command-parser";
import type { GifGeneration, TrainerSpriteId } from "../types/dex";
import type { IRandomGameAnswer } from "../types/games";
import type { HexCode } from "../types/tools";
import type { User } from "../users";
import type { IColorPick } from "./components/color-picker";
import { ManualHostDisplay } from "./components/manual-host-display";
import type { IHostDisplayProps } from "./components/host-display-base";
import type { IPokemonPick } from "./components/pokemon-picker-base";
import { RandomHostDisplay } from "./components/random-host-display";
import type { ITrainerPick } from "./components/trainer-picker";
import { HtmlPageBase } from "./html-page-base";

export type PokemonChoices = (IPokemonPick | undefined)[];
export type TrainerChoices = (ITrainerPick | undefined)[];
export type GifIcon = 'gif' | 'icon';

const excludedHintGames: string[] = ['hypnoshunches', 'mareaniesmarquees', 'pikachusmysterypokemon', 'smearglesmysterymoves',
'zygardesorders'];

const baseCommand = 'gamehostcontrolpanel';
const chooseHostInformation = 'choosehostinformation';
const chooseCustomDisplay = 'choosecustomdisplay';
const chooseRandomDisplay = 'chooserandomdisplay';
const chooseGenerateHints = 'choosegeneratehints';
const setCurrentPlayerCommand = 'setcurrentplayer';
const manualHostDisplayCommand = 'manualhostdisplay';
const randomHostDisplayCommand = 'randomhostdisplay';
const generateHintCommand = 'generatehint';
const sendDisplayCommand = 'senddisplay';
const autoSendCommand = 'autosend';
const autoSendYes = 'yes';
const autoSendNo = 'no';

const refreshCommand = 'refresh';
const autoRefreshCommand = 'autorefresh';
const closeCommand = 'close';

const maxGifs = 6;
const maxIcons = 15;
const maxTrainers = 6;

const pages: Dict<GameHostControlPanel> = {};

class GameHostControlPanel extends HtmlPageBase {
	static compatibleHintGames: string[] = [];
	static GameHostControlPanelLoaded: boolean = false;

	pageId = 'game-host-control-panel';

	autoSendDisplay: boolean = false;
	currentView: 'hostinformation' | 'manualhostdisplay' | 'randomhostdisplay' | 'generatehints';
	currentBackgroundColor: HexCode | undefined = undefined;
	currentPokemon: PokemonChoices = [];
	currentTrainers: TrainerChoices = [];
	currentPlayer: string = '';
	generateHintsGameHtml: string = '';
	generatedAnswer: IRandomGameAnswer | undefined = undefined;
	gifOrIcon: GifIcon = 'gif';
	pokemonGeneration: GifGeneration = 'xy';

	manualHostDisplay: ManualHostDisplay;
	randomHostDisplay: RandomHostDisplay;

	constructor(room: Room, user: User) {
		super(room, user, baseCommand);

		GameHostControlPanel.loadData();

		const hostDisplayProps: IHostDisplayProps = {
			maxGifs,
			maxIcons,
			maxTrainers,
			clearBackgroundColor: (dontRender) => this.clearBackgroundColor(dontRender),
			setBackgroundColor: (color, dontRender) => this.setBackgroundColor(color, dontRender),
			clearPokemon: (index, dontRender) => this.clearPokemon(index, dontRender),
			selectPokemon: (index, pokemon, dontRender) => this.selectPokemon(index, pokemon, dontRender),
			clearRandomizedPokemon: () => this.clearRandomizedPokemon(),
			randomizePokemon: (pokemon) => this.randomizePokemon(pokemon),
			clearTrainer: (index, dontRender) => this.clearTrainer(index, dontRender),
			selectTrainer: (index, trainer, dontRender) => this.selectTrainer(index, trainer, dontRender),
			randomizeTrainers: (trainers) => this.randomizeTrainers(trainers),
			setGifOrIcon: (gifOrIcon, currentPokemon, dontRender) => this.setGifOrIcon(gifOrIcon, currentPokemon, dontRender),
			reRender: () => this.send(),
		};

		this.currentView = room.userHostedGame && room.userHostedGame.isHost(user) ? 'hostinformation' : 'manualhostdisplay';

		this.manualHostDisplay = new ManualHostDisplay(this.commandPrefix, manualHostDisplayCommand, hostDisplayProps);
		this.manualHostDisplay.active = this.currentView === 'manualhostdisplay';

		this.randomHostDisplay = new RandomHostDisplay(this.commandPrefix, randomHostDisplayCommand,
			Object.assign({random: true}, hostDisplayProps));
		this.randomHostDisplay.active = false;

		this.components = [this.manualHostDisplay, this.randomHostDisplay];

		pages[this.userId] = this;
	}

	static loadData(): void {
		if (this.GameHostControlPanelLoaded) return;

		for (const format of Games.getFormatList()) {
			if (format.canGetRandomAnswer && format.minigameCommand && !excludedHintGames.includes(format.id)) {
				this.compatibleHintGames.push(format.name);
			}
		}

		this.GameHostControlPanelLoaded = true;
	}

	onClose(): void {
		delete pages[this.userId];
	}

	chooseHostInformation(): void {
		if (this.currentView === 'hostinformation') return;

		this.randomHostDisplay.active = false;
		this.manualHostDisplay.active = false;
		this.currentView = 'hostinformation';

		this.send();
	}

	chooseManualHostDisplay(): void {
		if (this.currentView === 'manualhostdisplay') return;

		this.manualHostDisplay.active = true;
		this.randomHostDisplay.active = false;
		this.currentView = 'manualhostdisplay';

		this.send();
	}

	chooseRandomHostDisplay(): void {
		if (this.currentView === 'randomhostdisplay') return;

		this.randomHostDisplay.active = true;
		this.manualHostDisplay.active = false;
		this.currentView = 'randomhostdisplay';

		this.send();
	}

	chooseGenerateHints(): void {
		if (this.currentView === 'generatehints') return;

		this.randomHostDisplay.active = false;
		this.manualHostDisplay.active = false;
		this.currentView = 'generatehints';

		this.send();
	}

	setCurrentPlayer(id: string): void {
		if (this.currentPlayer === id) return;

		this.currentPlayer = id;

		this.send();
	}

	clearBackgroundColor(dontRender: boolean | undefined): void {
		this.currentBackgroundColor = undefined;

		if (!dontRender) this.send();
	}

	setBackgroundColor(color: IColorPick, dontRender: boolean | undefined): void {
		this.currentBackgroundColor = color.hexCode;

		if (this.currentView === 'randomhostdisplay') {
			this.manualHostDisplay.setRandomizedBackgroundColor(color.hueVariation, color.lightness, color.hexCode);
		}

		if (!dontRender) {
			if (this.autoSendDisplay) this.sendHostDisplay();
			this.send();
		}
	}

	clearPokemon(index: number, dontRender: boolean | undefined): void {
		this.currentPokemon[index] = undefined;

		if (!dontRender) this.send();
	}

	selectPokemon(index: number, pokemon: IPokemonPick, dontRender: boolean | undefined): void {
		this.currentPokemon[index] = pokemon;

		if (!dontRender) {
			if (this.autoSendDisplay) this.sendHostDisplay();
			this.send();
		}
	}

	clearRandomizedPokemon(): void {
		this.currentPokemon = [];

		this.send();
	}

	randomizePokemon(pokemon: PokemonChoices): void {
		this.manualHostDisplay.setRandomizedPokemon(pokemon);
		this.currentPokemon = pokemon;

		if (this.autoSendDisplay) this.sendHostDisplay();
		this.send();
	}

	clearTrainer(index: number, dontRender: boolean | undefined): void {
		this.currentTrainers[index] = undefined;

		if (!dontRender) this.send();
	}

	selectTrainer(index: number, trainer: ITrainerPick, dontRender: boolean | undefined): void {
		this.currentTrainers[index] = trainer;

		if (!dontRender) {
			if (this.autoSendDisplay) this.sendHostDisplay();
			this.send();
		}
	}

	randomizeTrainers(trainers: TrainerChoices): void {
		this.manualHostDisplay.setRandomizedTrainers(trainers);
		this.currentTrainers = trainers;

		if (this.autoSendDisplay) this.sendHostDisplay();
		this.send();
	}

	setGifOrIcon(gifOrIcon: GifIcon, currentPokemon: PokemonChoices, dontRender: boolean | undefined): void {
		this.gifOrIcon = gifOrIcon;

		if (this.currentView === 'manualhostdisplay') {
			this.randomHostDisplay.setGifOrIcon(gifOrIcon, true);
		} else {
			this.manualHostDisplay.setGifOrIcon(gifOrIcon, true);
		}

		this.currentPokemon = currentPokemon;

		if (!dontRender) this.send();
	}

	setAutoSend(autoSend: boolean): void {
		if (this.autoSendDisplay === autoSend) return;

		this.autoSendDisplay = autoSend;

		this.send();
	}

	generateHint(user: User, name: string): boolean {
		if (!GameHostControlPanel.compatibleHintGames.includes(name)) return false;

		const format = Games.getFormat(name);
		if (Array.isArray(format) || !format.canGetRandomAnswer) return false;

		if (user.game) user.game.deallocate(true);

		const game = Games.createGame(user, format, this.room, true);
		this.generateHintsGameHtml = game.getMascotAndNameHtml(undefined, true);
		this.generatedAnswer = game.getRandomAnswer!();
		game.deallocate(true);

		this.send();

		return true;
	}

	getTrainers(): TrainerSpriteId[] {
		return this.currentTrainers.filter(x => x !== undefined).map(x => x!.trainer);
	}

	getPokemon(): string[] {
		return this.currentPokemon.filter(x => x !== undefined).map(x => x!.pokemon + (x!.shiny ? "|shiny" : ""));
	}

	getHostDisplay(): string {
		return Games.getHostCustomDisplay(this.userName, this.currentBackgroundColor, this.getTrainers(), this.getPokemon(),
			this.gifOrIcon === 'icon', this.pokemonGeneration);
	}

	sendHostDisplay(): void {
		const user = Users.get(this.userName);
		if (!user || !this.room.userHostedGame || !this.room.userHostedGame.isHost(user)) return;

		this.room.userHostedGame.sayHostDisplayUhtml(user, this.currentBackgroundColor, this.getTrainers(), this.getPokemon(),
			this.gifOrIcon === 'icon', this.pokemonGeneration);
	}

	render(): string {
		let html = "<div class='chat' style='margin-top: 4px;margin-left: 4px'><center><b>" + this.room.title + ": Hosting Control " +
			"Panel</b>";
		html += "&nbsp;" + Client.getPmSelfButton(this.commandPrefix + ", " + closeCommand, "Close");
		html += "<br /><br />";

		const user = Users.get(this.userId);
		const currentHost = user && this.room.userHostedGame && this.room.userHostedGame.isHost(user);

		const hostInformation = this.currentView === 'hostinformation';
		const manualHostDisplay = this.currentView === 'manualhostdisplay';
		const randomHostDisplay = this.currentView === 'randomhostdisplay';
		const generateHints = this.currentView === 'generatehints';

		html += "Options:";
		if (currentHost) {
			html += "&nbsp;" + Client.getPmSelfButton(this.commandPrefix + ", " + chooseHostInformation, "Host Information",
				hostInformation);
		}
		html += "&nbsp;" + Client.getPmSelfButton(this.commandPrefix + ", " + chooseCustomDisplay, "Manual Display", manualHostDisplay);
		html += "&nbsp;" + Client.getPmSelfButton(this.commandPrefix + ", " + chooseRandomDisplay, "Random Display", randomHostDisplay);
		html += "&nbsp;" + Client.getPmSelfButton(this.commandPrefix + ", " + chooseGenerateHints, "Generate Hints", generateHints);
		html += "</center>";

		if (hostInformation) {
			html += "<h3>Host Information</h3>";

			const game = this.room.userHostedGame!;

			html += game.getMascotAndNameHtml();
			html += "<br />";
			html += "<b>Remaining time</b>: " + Tools.toDurationString(game.endTime - Date.now());
			html += "&nbsp;" + Client.getPmSelfButton(this.commandPrefix + ", " + refreshCommand, "Refresh");
			html += "<hr />";

			if (game.gameTimerEndTime) {
				html += "<b>Game timer:</b> " + Tools.toDurationString(game.gameTimerEndTime - Date.now()) + " remaining";
				html += "&nbsp;" + Client.getPmSelfButton(this.commandPrefix + ", " + refreshCommand, "Refresh");
				html += "<br /><br />";
			}

			if (game.twist || game.storedMessages) {
				let twistHtml = "";
				if (game.twist) {
					twistHtml = "<b>Twist</b>: " + game.twist;
					twistHtml += "&nbsp;" + Client.getMsgRoomButton(this.room, Config.commandCharacter + "twist", "Send");
				}

				let storedMessages = "";
				if (game.storedMessages) {
					storedMessages += "<b>Stored messages</b>:";
					storedMessages += "<br />[key] | [message]<br />";
					for (const i in game.storedMessages) {
						storedMessages += "<br />" + (i || "(none)") + " | <code>" + game.storedMessages[i] + "</code>";
						storedMessages += "&nbsp;" + Client.getMsgRoomButton(this.room,
							Config.commandCharacter + "stored" + (i ? " " + i : ""), "Send");
					}
				}

				if (twistHtml && storedMessages) {
					html += twistHtml;
					html += "<br /><br />";
					html += storedMessages;
				} else if (twistHtml) {
					html += twistHtml;
				} else if (storedMessages) {
					html += storedMessages;
				}

				html += "<br /><br />";
			}

			const remainingPlayerCount = game.getRemainingPlayerCount();
			html += "<b>Players</b> (" + remainingPlayerCount + ")" + (remainingPlayerCount ? ":" : "");
			if (game.teams) {
				html += "<br />";
				for (const i in game.teams) {
					const team = game.teams[i];
					html += "Team " + team.name + (team.points ? " (" + team.points + ")" : "") + " - " +
						game.getPlayerNames(game.getRemainingPlayers(team.players));
					html += "<br />";
				}
			} else {
				html += " " + game.getPlayerPoints();
				html += "<br />";
			}

			if (game.savedWinners.length) html += "<br /><b>Saved winners</b>: " + Tools.joinList(game.savedWinners.map(x => x.name));

			const remainingPlayers = Object.keys(game.getRemainingPlayers());
			if (game.scoreCap || remainingPlayers.length) html += "<br /><b>Points</b>:";
			if (game.scoreCap) html += "<br />(the score cap is <b>" + game.scoreCap + "</b>)";

			if (remainingPlayers.length) {
				html += "<br /><center>";
				html += Client.getPmSelfButton(this.commandPrefix + ", " + setCurrentPlayerCommand, "Hide points buttons",
					!this.currentPlayer);

				if (game.teams) {
					html += "<br /><br />";
					for (const i in game.teams) {
						const remainingTeamPlayers = Object.keys(game.getRemainingPlayers(game.teams[i].players));
						if (remainingTeamPlayers.length) {
							html += "Team " + game.teams[i].name + ":";
							for (const id of remainingTeamPlayers) {
								const player = game.players[id];
								html += "&nbsp;" + Client.getPmSelfButton(this.commandPrefix + ", " + setCurrentPlayerCommand + ", " + id,
									player.name, this.currentPlayer === id);
							}
							html += "<br />";
						}
					}

					if (this.currentPlayer) html += "<br />";
				} else {
					for (const id of remainingPlayers) {
						const player = game.players[id];
						html += "&nbsp;" + Client.getPmSelfButton(this.commandPrefix + ", " + setCurrentPlayerCommand + ", " + id,
							player.name, this.currentPlayer === id);
					}

					if (this.currentPlayer) html += "<br /><br />";
				}

				if (this.currentPlayer) {
					const currentPlayer = Users.get(this.currentPlayer);
					const name = currentPlayer ? currentPlayer.name : this.currentPlayer;

					for (let i = 1; i <= 5; i++) {
						if (i > 1) html += "&nbsp;";
						html += Client.getMsgRoomButton(this.room, Config.commandCharacter + "apt " + name + ", " + i,
							"Add " + i + " point" + (i > 1 ? "s" : ""), !game.started);
					}

					html += "<br />";
					for (let i = 1; i <= 5; i++) {
						if (i > 1) html += "&nbsp;";
						html += Client.getMsgRoomButton(this.room, Config.commandCharacter + "rpt " + name + ", " + i,
							"Remove " + i + " point" + (i > 1 ? "s" : ""), !game.started);
					}
				}

				html += "</center>";
			}
		} else if (manualHostDisplay || randomHostDisplay) {
			html += "<h3>" + (manualHostDisplay ? "Manual" : "Random") + " Display</h3>";
			html += this.getHostDisplay();
			html += "<center>" + Client.getPmSelfButton(this.commandPrefix + ", " + sendDisplayCommand, "Send to " + this.room.title,
				!currentHost) + "</center>";

			html += "<br />";
			html += "Auto-send after any change: ";
			html += Client.getPmSelfButton(this.commandPrefix + ", " + autoSendCommand + ", " + autoSendYes, "Yes",
				!currentHost || this.autoSendDisplay);
			html += "&nbsp;" + Client.getPmSelfButton(this.commandPrefix + ", " + autoSendCommand + ", " + autoSendNo, "No",
				!currentHost || !this.autoSendDisplay);

			html += "<br /><br />";
			if (manualHostDisplay) {
				html += this.manualHostDisplay.render();
			} else {
				html += this.randomHostDisplay.render();
			}
		} else {
			html += "<h3>Generate Hints</h3>";

			if (this.generatedAnswer) {
				html += "<div class='infobox'>" + this.generateHintsGameHtml;
				html += "<br /><br />";
				html += this.generatedAnswer.hint;
				html += "<br /><br />";
				html += "<b>Answer" + (this.generatedAnswer.answers.length > 1 ? "s" : "") + "</b>: " +
					this.generatedAnswer.answers.join(", ") + "</div>";
			} else {
				html += "<center><b>Click on a game's name to generate a hint and see the answer</b>!</center>";
			}
			html += "<br />";

			for (let i = 0; i < GameHostControlPanel.compatibleHintGames.length; i++) {
				const format = Games.getFormat(GameHostControlPanel.compatibleHintGames[i]);
				if (Array.isArray(format) || !format.canGetRandomAnswer) continue;

				if (i > 0) html += "&nbsp;";
				html += Client.getPmSelfButton(this.commandPrefix + ", " + generateHintCommand + ", " + format.name, format.name);
			}
		}

		html += "</div>";
		return html;
	}
}

export const commands: BaseCommandDefinitions = {
	[baseCommand]: {
		command(target, room, user) {
			if (!this.isPm(room)) return;
			const targets = target.split(",");
			const targetRoom = Rooms.search(targets[0]);
			if (!targetRoom) return this.sayError(['invalidBotRoom', targets[0]]);
			targets.shift();

			const cmd = Tools.toId(targets[0]);
			targets.shift();

			if (!cmd) {
				if (!(user.id in pages)) {
					new GameHostControlPanel(targetRoom, user).open();
				} else {
					pages[user.id].send();
				}
			} else if (cmd === chooseHostInformation) {
				if (!(user.id in pages)) new GameHostControlPanel(targetRoom, user);
				pages[user.id].chooseHostInformation();
			} else if (cmd === chooseCustomDisplay) {
				if (!(user.id in pages)) new GameHostControlPanel(targetRoom, user);
				pages[user.id].chooseManualHostDisplay();
			} else if (cmd === chooseRandomDisplay) {
				if (!(user.id in pages)) new GameHostControlPanel(targetRoom, user);
				pages[user.id].chooseRandomHostDisplay();
			} else if (cmd === chooseGenerateHints) {
				if (!(user.id in pages)) new GameHostControlPanel(targetRoom, user);
				pages[user.id].chooseGenerateHints();
			} else if (cmd === refreshCommand) {
				if (!(user.id in pages)) new GameHostControlPanel(targetRoom, user);
				pages[user.id].send();
			} else if (cmd === autoRefreshCommand) {
				if (user.id in pages) pages[user.id].send();
			} else if (cmd === generateHintCommand) {
				const name = targets[0].trim();
				if (!(user.id in pages)) new GameHostControlPanel(targetRoom, user);

				if (!pages[user.id].generateHint(user, name)) this.say("'" + name + "' is not a valid game for generating hints.");
			} else if (cmd === setCurrentPlayerCommand) {
				if (!(user.id in pages) || !targetRoom.userHostedGame || !targetRoom.userHostedGame.isHost(user)) return;

				pages[user.id].setCurrentPlayer(Tools.toId(targets[0]));
			} else if (cmd === autoSendCommand) {
				if (!(user.id in pages)) new GameHostControlPanel(targetRoom, user);

				const option = targets[0].trim();
				if (option !== autoSendYes && option !== autoSendNo) {
					return this.say("'" + option + "' is not a valid auto-send option.");
				}

				pages[user.id].setAutoSend(option === autoSendYes);
			} else if (cmd === sendDisplayCommand) {
				if (!(user.id in pages)) return;
				pages[user.id].sendHostDisplay();
			} else if (cmd === closeCommand) {
				if (!(user.id in pages)) new GameHostControlPanel(targetRoom, user);
				pages[user.id].close();
				delete pages[user.id];
			} else {
				if (!(user.id in pages)) new GameHostControlPanel(targetRoom, user);
				const error = pages[user.id].checkComponentCommands(cmd, targets);
				if (error) this.say(error);
			}
		},
		aliases: ['ghcp'],
	},
};