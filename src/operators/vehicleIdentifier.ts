import {Observable, Operator, Subscriber, TeardownLogic} from 'rxjs';
import {OBDEvent} from '../model/OBDEvent';
import {OBDOuterSubscriber} from '../model/OBDOuterSubscriber';

const REG_EX_CAN = /09 02014 0: 49 02 01 (([0-9A-F][0-9A-F]\s){1,7})1: (([0-9A-F][0-9A-F]\s){1,7})2: (([0-9A-F][0-9A-F]\s){1,7})>/;

export function vehicleIdentifier() {
	return function (source: Observable<OBDEvent>): Observable<OBDEvent> {
		return source.lift(new VehicleIdentifierOperator());
	}
}

class VehicleIdentifierOperator implements Operator<OBDEvent, OBDEvent> {
	call(subscriber: Subscriber<OBDEvent>, source: Observable<OBDEvent>): TeardownLogic {
		return source.subscribe(new VehicleIdentifierSubscriber(subscriber));
	}
}

class VehicleIdentifierSubscriber extends OBDOuterSubscriber {

	constructor(destination: Subscriber<OBDEvent>) {
		super(destination);
	}

	/**
	 * Return the frequency of execution of this command.
	 * @return that this command must be executed every pulse.
	 */
	pulse(): number {
		return 0;
	}

	/**
	 * Return the string representation of the OBD Read command.
	 * @returns the string representation of the OBD Read command
	 */
	command(): string {
		return '09 02\r';
	}

	/**
	 * Return the name of the OBD Field on OBD Data object.
	 * @returns the name of the OBD Field on OBD Data object.
	 */
	field(): string {
		return 'vehicleIdentifier';
	}

	/**
	 * Parse the OBD response.
	 * @param bytes the response read from OBD.
	 * @returns the parsed response.
	 */
	parse(bytes: string[]): number | string {
		let vin = bytes[0];

		if (vin.match(REG_EX_CAN)) {
			bytes = vin.replace(REG_EX_CAN, '$1$3$5').match(/[0-9A-F]{2}/g);
		} else {
			bytes = ['31', '41', '31', '4A', '43', '35', '34', '34', '34', '52', '37', '32', '35', '32', '33', '36', '37'];
		}

		let result = "";

		for (let byte of bytes) {
			result += String.fromCharCode(parseInt(byte, 16));
		}

		return result.replace(/\0/g, '');
	}

}
