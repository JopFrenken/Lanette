import type { Player } from "../room-activity";
import { Game } from "../room-game";
import type { Room } from "../rooms";
import type { GameCommandDefinitions, GameCommandReturnType, IGameFile } from "../types/games";
import type { User } from "../users";

const terrains = {
	'Basic': 'Normal',
	'Cavernous': 'Dragon',
	'Cloudy': 'Flying',
	'Electrified': 'Electric',
	'Grassy': 'Grass',
	'Infested': 'Bug',
	'Metallic': 'Steel',
	'Misty': 'Fairy',
	'Molten': 'Fire',
	'Rocky': 'Rock',
	'Sandy': 'Ground',
	'Shady': 'Dark',
	'Snowy': 'Ice',
	'Spooky': 'Ghost',
	'Swampy': 'Water',
	'Twisted': 'Psychic',
	'Venomous': 'Poison',
	'Violent': 'Fighting',
};
type TerrainKey = keyof typeof terrains;
const terrainKeys = Object.keys(terrains) as TerrainKey[];
const data: {pokemon: KeyedDict<TerrainKey, string[]>} = {
	pokemon: {
		'Basic': [],
		'Cavernous': [],
		'Cloudy': [],
		'Electrified': [],
		'Grassy': [],
		'Infested': [],
		'Metallic': [],
		'Misty': [],
		'Molten': [],
		'Rocky': [],
		'Sandy': [],
		'Shady': [],
		'Snowy': [],
		'Spooky': [],
		'Swampy': [],
		'Twisted': [],
		'Venomous': [],
		'Violent': [],
	},
};

class TapusTerrains extends Game {
	canJump: boolean = false;
	canLateJoin: boolean = true;
	currentTerrain: TerrainKey | null = null;
	firstJump: Player | null = null;
	isElimination: boolean = false;
	points = new Map<Player, number>();
	queue: Player[] = [];
	revealTime: number = 3.5 * 1000;
	roundJumps = new Map<Player, boolean>();
	targetPokemon: string | null = null;
	terrainRound: number = 0;

	static loadData(room: Room | User): void {
		const pokedex = Games.getPokemonList(x => Dex.hasGifData(x));
		for (const pokemon of pokedex) {
			for (const type of pokemon.types) {
				for (const key of terrainKeys) {
					if (type === terrains[key]) {
						data.pokemon[key].push(pokemon.name);
						break;
					}
				}
			}
		}
	}

	onAddPlayer(player: Player, lateJoin?: boolean): boolean {
		if (this.terrainRound > 1) {
			player.say("Sorry, the late-join period has ended.");
			return false;
		}
		return true;
	}

	onSignups(): void {
		if (this.format.options.freejoin) this.timeout = setTimeout(() => this.nextRound(), 5000);
	}

	onStart(): void {
		this.nextRound();
	}

	onNextRound(): void {
		this.canJump = false;
		if (this.round > 1 && this.targetPokemon && this.currentTerrain) {
			if (!data.pokemon[this.currentTerrain].includes(this.targetPokemon)) {
				if (!this.format.options.freejoin) {
					for (const i in this.players) {
						if (this.players[i].eliminated) continue;
						if (this.queue.includes(this.players[i]) || this.roundJumps.has(this.players[i])) {
							this.eliminatePlayer(this.players[i], "You jumped on a Pokemon of the wrong type!");
						}
					}
				}
			} else {
				this.currentTerrain = null;
				if (!this.format.options.freejoin) {
					const len = this.queue.length;
					if (len > 1 && this.isElimination) {
						this.eliminatePlayer(this.queue[len - 1], "You were the last player to jump on " + this.targetPokemon + "!");
					}
					for (const i in this.players) {
						if (this.players[i].eliminated) continue;
						if (!this.queue.includes(this.players[i])) {
							this.eliminatePlayer(this.players[i], "You did not jump on " + this.targetPokemon + "!");
						}
					}
					// if (len) this.markFirstAction(this.queue[0], 'firstJump');
				}
			}

			if (!this.format.options.freejoin && this.getRemainingPlayerCount() < 2) return this.end();
		}

		let newTerrain = false;
		if (!this.currentTerrain) {
			this.currentTerrain = this.sampleOne(terrainKeys);
			newTerrain = true;
			this.terrainRound++;
			if (!this.format.options.freejoin) {
				if (this.revealTime > 2000) this.revealTime -= 500;
				if (this.terrainRound === 20) {
					this.end();
					return;
				}
			}
		}

		let targetPokemon = '';
		if (this.random(2)) {
			targetPokemon = this.sampleOne(data.pokemon[this.currentTerrain]);
		} else {
			while (!targetPokemon || data.pokemon[this.currentTerrain].includes(targetPokemon)) {
				let otherTerrain = this.sampleOne(terrainKeys);
				while (otherTerrain === this.currentTerrain) {
					otherTerrain = this.sampleOne(terrainKeys);
				}
				targetPokemon = this.sampleOne(data.pokemon[otherTerrain]);
			}
		}
		this.targetPokemon = targetPokemon;
		this.queue = [];

		if (!this.format.options.freejoin) this.roundJumps.clear();

		const pokemonHtml = '<div class="infobox"><center>' + Dex.getPokemonGif(Dex.getExistingPokemon(this.targetPokemon)) +
			'<br />A wild <b>' + this.targetPokemon + '</b> appeared!</center></div>';
		if (newTerrain) {
			const roundHtml = this.getRoundHtml(this.format.options.freejoin ? this.getPlayerPoints : this.getPlayerNames, null,
				"Round " + this.terrainRound);
			const uhtmlName = this.uhtmlBaseName + '-round';
			this.onUhtml(uhtmlName, roundHtml, () => {
				const terrainHtml = '<div class="infobox"><center><br />The terrain is <b>' + this.currentTerrain + '</b> (jump on <b>' +
					terrains[this.currentTerrain!] + '</b> type Pokemon)!<br />&nbsp;</center></div>';
				const uhtmlName = this.uhtmlBaseName + '-terrain';
				this.onUhtml(uhtmlName, terrainHtml, () => {
					// if (this.timeout) clearTimeout(this.timeout); // mocha tests
					this.timeout = setTimeout(() => {
						const uhtmlName = this.uhtmlBaseName + '-pokemon';
						this.onUhtml(uhtmlName, pokemonHtml, () => {
							this.canJump = true;
							// if (this.timeout) clearTimeout(this.timeout); // mocha tests
							this.timeout = setTimeout(() => this.nextRound(), this.revealTime);
						});
						this.sayUhtml(uhtmlName, pokemonHtml);
					}, this.revealTime);
				});
				this.timeout = setTimeout(() => this.sayUhtml(uhtmlName, terrainHtml), 5 * 1000);
			});
			this.sayUhtml(uhtmlName, roundHtml);
		} else {
			this.timeout = setTimeout(() => {
				const uhtmlName = this.uhtmlBaseName + '-pokemon';
				this.onUhtml(uhtmlName, pokemonHtml, () => {
					this.canJump = true;
					// if (this.timeout) clearTimeout(this.timeout); // mocha tests
					this.timeout = setTimeout(() => this.nextRound(), this.revealTime);
				});
				this.sayUhtmlAuto(uhtmlName, pokemonHtml);
			}, this.revealTime);
		}
	}

	onEnd(): void {
		for (const i in this.players) {
			if (this.players[i].eliminated) continue;
			const player = this.players[i];
			this.winners.set(player, 1);
			this.addBits(player, 500);
			// if (player === this.firstJump) Games.unlockAchievement(this.room, player, "Rainbow Wing", this);
		}

		this.announceWinners();
	}
}

const commands: GameCommandDefinitions<TapusTerrains> = {
	jump: {
		// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
		command(target, room, user): GameCommandReturnType {
			const player = this.createPlayer(user) || this.players[user.id];
			if (this.roundJumps.has(player)) return false;
			this.roundJumps.set(player, true);
			if (!this.canJump) return false;

			if (this.format.options.freejoin) {
				if (this.currentTerrain && this.targetPokemon && data.pokemon[this.currentTerrain].includes(this.targetPokemon)) {
					if (this.timeout) clearTimeout(this.timeout);
					this.currentTerrain = null;
					const points = this.addPoints(player, 1);
					if (points === this.format.options.points) {
						for (const i in this.players) {
							if (this.players[i] !== player) this.players[i].eliminated = true;
						}
						this.end();
					} else {
						this.say("**" + player.name + "** advances to **" + points + "** point" + (points > 1 ? "s" : "") + "!");
						this.timeout = setTimeout(() => {
							this.roundJumps.clear();
							this.nextRound();
						}, 5000);
					}
				}
			} else {
				this.queue.push(player);
			}
			return true;
		},
	},
};

export const game: IGameFile<TapusTerrains> = {
	aliases: ['tapus', 'terrains', 'trace', 'tr'],
	category: 'reaction',
	class: TapusTerrains,
	commandDescriptions: [Config.commandCharacter + 'jump'],
	commands,
	defaultOptions: ['freejoin', 'points'],
	description: "Players race through various terrains on Pokemon! Only jump on Pokemon of the appropriate type in each terrain.",
	formerNames: ["Terrain Race"],
	name: "Tapus' Terrains",
	mascots: ['tapu koko', 'tapu lele', 'tapu bulu', 'tapu fini'],
	mascotPrefix: "Tapus'",
	variants: [
		{
			name: "Tapus' Terrains Elimination",
			isElimination: true,
			variant: "elimination",
		},
	],
};
