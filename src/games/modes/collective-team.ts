import type { Player, PlayerTeam } from "../../room-activity";
import type { ScriptedGame } from "../../room-game-scripted";
import type {
	DefaultGameOption, GameCommandDefinitions, GameCommandReturnType, IGameFormat, IGameModeFile
} from "../../types/games";
import type { QuestionAndAnswer } from "../templates/question-and-answer";

const BASE_POINTS = 20;

const name = 'Collective Team';
const description = 'Players will be split into teams but everyone can answer each round!';
const removedOptions: string[] = ['points', 'freejoin'];

type CollectiveTeamThis = QuestionAndAnswer & CollectiveTeam;

export class CollectiveTeam {
	static modeName: string = name;

	canLateJoin: boolean = true;
	firstAnswers: Dict<Player | false> = {};
	lateJoinQueueSize: number = 0;
	minPlayers: number = 4;
	playerOrders: Dict<Player[]> = {};
	queueLateJoins: boolean = true;
	teamRound: number = 0;
	teams: Dict<PlayerTeam> = {};

	// set in onStart()
	largestTeam!: PlayerTeam;

	static setOptions<T extends ScriptedGame>(format: IGameFormat<T>, namePrefixes: string[]): void {
		if (!format.name.includes(this.modeName)) namePrefixes.unshift(this.modeName);
		format.description += ' ' + description;

		if (!format.defaultOptions.includes('teams')) format.defaultOptions.push('teams');

		for (const option of removedOptions) {
			const index = format.defaultOptions.indexOf(option as DefaultGameOption);
			if (index !== -1) format.defaultOptions.splice(index, 1);

			delete format.customizableOptions[option];
		}

		if (!('teamPoints' in format.customizableOptions)) {
			format.customizableOptions.teamPoints = {
				min: BASE_POINTS,
				base: BASE_POINTS,
				max: BASE_POINTS,
			};
		}
	}

	tryQueueLateJoin(this: CollectiveTeamThis, player: Player): boolean {
		const teams = Object.keys(this.teams);
		const teamSize = this.getRemainingPlayerCount(this.teams[teams[0]].players);
		teams.shift();

		let equalTeams = true;
		for (const team of teams) {
			if (this.getRemainingPlayerCount(this.teams[team].players) !== teamSize) {
				equalTeams = false;
				break;
			}
		}

		if (equalTeams) return false;

		this.addLateJoinPlayerToTeam(player, this.getSmallestTeam());
		return true;
	}

	onAddLateJoinQueuedPlayers(this: CollectiveTeamThis, queuedPlayers: Player[]): void {
		const teams = Object.keys(this.teams);
		for (const queuedPlayer of queuedPlayers) {
			this.addLateJoinPlayerToTeam(queuedPlayer, this.teams[teams[0]]);
			teams.shift();
		}
	}

	addLateJoinPlayerToTeam(this: CollectiveTeamThis, player: Player, team: PlayerTeam): void {
		player.frozen = false;
		team.addPlayer(player);
		this.playerOrders[team.id].push(player);

		player.sayPrivateUhtml("You are on **Team " + team.name + "** with: " + Tools.joinList(team.getTeammateNames(player)),
			this.joinLeaveButtonUhtmlName);
	}

	setTeams(this: CollectiveTeamThis): void {
		this.lateJoinQueueSize = this.format.options.teams;
		this.teams = this.generateTeams(this.format.options.teams);
		this.setLargestTeam();

		for (const id in this.teams) {
			const team = this.teams[id];
			this.playerOrders[team.id] = [];
			this.say("**Team " + team.name + "**: " + Tools.joinList(team.getPlayerNames()));
		}
	}

	onRemovePlayer(this: CollectiveTeamThis, player: Player): void {
		if (!this.started || !player.team) return;

		const playerOrderIndex = this.playerOrders[player.team.id].indexOf(player);
		if (playerOrderIndex !== -1) this.playerOrders[player.team.id].splice(playerOrderIndex, 1);

		this.setLargestTeam();
	}

	onStart(this: CollectiveTeamThis): void {
		this.setTeams();
		this.timeout = setTimeout(() => this.nextRound(), 5 * 1000);
	}

	getTeamPoints(): string {
		const points: string[] = [];
		for (const i in this.teams) {
			points.push("<b>" + this.teams[i].name + "</b>: " + this.teams[i].points);
		}

		return points.join(" | ");
	}

	beforeNextRound(this: CollectiveTeamThis): boolean | string {
		const emptyTeams = this.getEmptyTeams();
		for (const team of emptyTeams) {
			delete this.teams[team.id];
		}

		if (emptyTeams.length >= this.format.options.teams - 1) {
			this.say("Only one team remains!");
			const winningTeam = this.getFinalTeam()!;
			for (const player of winningTeam.players) {
				this.winners.set(player, 1);
			}

			this.timeout = setTimeout(() => this.end(), 5000);
			return false;
		} else {
			return true;
		}
	}

	onEnd(this: CollectiveTeamThis): void {
		this.winners.forEach((value, player) => {
			const points = this.points.get(player);
			let earnings = 250;
			if (points) {
				earnings += 50 * points;
			}
			this.addBits(player, earnings);
		});

		this.convertPointsToBits(0);
		this.announceWinners();
	}
}

const commandDefinitions: GameCommandDefinitions<CollectiveTeamThis> = {
	guess: {
		command(target, room, user, cmd, timestamp): GameCommandReturnType {
			if (this.answerCommands && !this.answerCommands.includes(cmd)) return false;
			if (!this.canGuessAnswer(this.players[user.id])) return false;

			const player = this.players[user.id];
			const answer = this.guessAnswer(player, target);
			if (!answer || !this.canGuessAnswer(player)) return false;

			if (this.timeout) clearTimeout(this.timeout);

			if (this.onCorrectGuess) this.onCorrectGuess(player, answer);

			const awardedPoints = this.getPointsForAnswer ? this.getPointsForAnswer(answer, timestamp) : 1;
			let points = this.points.get(player) || 0;
			points += awardedPoints;
			this.points.set(player, points);
			player.team!.points += awardedPoints;

			if (this.allAnswersTeamAchievement) {
				if (player.team!.id in this.firstAnswers) {
					if (this.firstAnswers[player.team!.id] && this.firstAnswers[player.team!.id] !== player) {
						this.firstAnswers[player.team!.id] = false;
					}
				} else {
					this.firstAnswers[player.team!.id] = player;
				}
			}

			if (this.hint) this.off(this.hint);
			this.say('**' + player.name + '** advances Team ' + player.team!.name + ' to **' + player.team!.points + '** point' +
				(player.team!.points > 1 ? 's' : '') + '!');
			this.displayAnswers(answer);
			if (player.team!.points >= this.format.options.teamPoints) {
				if (this.allAnswersTeamAchievement && this.firstAnswers[player.team!.id] === player) {
					this.unlockAchievement(player, this.allAnswersTeamAchievement);
				}

				for (const teamMember of player.team!.players) {
					if (!teamMember.eliminated) this.winners.set(teamMember, 1);
				}
				this.end();
				return true;
			}

			this.answers = [];
			this.timeout = setTimeout(() => this.nextRound(), 5000);

			return true;
		},
		aliases: ['g'],
	},
};

export const commands = CommandParser.loadCommandDefinitions(commandDefinitions);

export const initialize = (game: QuestionAndAnswer): void => {
	const mode = new CollectiveTeam();
	const propertiesToOverride = Object.getOwnPropertyNames(mode)
		.concat(Object.getOwnPropertyNames(CollectiveTeam.prototype)) as (keyof CollectiveTeam)[];

	for (const property of propertiesToOverride) {
		// @ts-expect-error
		game[property] = mode[property];
	}

	game.loadModeCommands(commands);
};

export const mode: IGameModeFile<CollectiveTeam, QuestionAndAnswer, CollectiveTeamThis> = {
	aliases: ['ct', 'group', 'collective'],
	class: CollectiveTeam,
	commands,
	description,
	initialize,
	name,
	naming: 'prefix',
	removedOptions,
};
