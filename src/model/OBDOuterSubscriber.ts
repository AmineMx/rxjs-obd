import {from, Subscriber, zip} from 'rxjs';
import {map, mergeMap, take} from 'rxjs/operators';
import {OuterSubscriber} from '../internal/OuterSubscriber';
import {isSupportedPID} from '../internal/utils';
import {obdReader} from '../operators/obdReader';
import {OBDEvent} from './OBDEvent';

const OBD_NO_DATA: string = 'NO DATA';
const OBD_OUTPUT_DELIMITER = '\r';

export abstract class OBDOuterSubscriber extends OuterSubscriber<OBDEvent, OBDEvent> {

	protected constructor(destination: Subscriber<OBDEvent>) {
		super(destination);
	}

	/**
	 * Return an integer that represent the frequency of execution of this command.
	 * 0 - Just once.
	 * 1 - Every pulse
	 * n - id % n === 0.
	 */
	abstract pulse(): number

	/**
	 * Return the string representation of the OBD Read command.
	 * For example use '010C\r' for Engine RPM.
	 * @returns the string representation of the OBD Read command
	 */
	abstract command(): string;

	/**
	 * Return the name of the OBD Field on OBD Data object.
	 * For example use 'rpm' for Engine RPM.
	 * @returns the name of the OBD Field on OBD Data object.
	 */
	abstract field(): string | string[];

	/**
	 * Parse the OBD response.
	 * @param bytes the response read from OBD.
	 * @returns the parsed response.
	 */
	abstract parse(bytes: string[]): number | string | (number | string)[];

	/**
	 * Send the command to OBD Reader and try to read the response.
	 * @param event The OBD reader event loop.
	 */
	protected _next(event: OBDEvent) {
		const self = this;

		const service01 = this.command().match(/(\d\d) ([0-9A-F][0-9A-F]) 1\r/);

		if (!service01 || isSupportedPID(event.data, service01[2])) {
			event.connection.send(this.command()).subscribe({
				error: (error: any) => self.destination.error(error),
				complete: () => self.read(event)
			});
		} else {
			this.destination.next(event);
		}
	}

	/**
	 * Read one return from OBD, parse and update event.
	 * @param event the OBD reader event loop.
	 */
	read(event: OBDEvent) {
		event.connection.onData().pipe(
			mergeMap((data: string) => from(data.split(OBD_OUTPUT_DELIMITER))),
			obdReader(),
			take(1),
			map((result: string[]) => {
				return OBD_NO_DATA !== result[0] ? this.parse(result) : OBD_NO_DATA;
			}),
		).subscribe(
			(value: number | string | (number | string)[]) => {
				if (Array.isArray(this.field())) {
					const values = <(number | string)[]>value;
					zip(from(this.field()), from(<(number | string)[]>value)).subscribe(
						([field, _value]) => event.update(field, _value)
					);
				} else {
					const segment = (<string>this.field()).match(/supportedPIDs\.(segment[0-9A-F][0-9A-F])/);
					if (segment) {
						event.supportedPIDs(segment[1], <number>value);
					} else if (OBD_NO_DATA !== value) {
						event.update(<string>this.field(), <number | string>value);
					}
				}

				this.destination.next(event);
			},
			(error: any) => this.destination.error(error)
		);
	}
}
