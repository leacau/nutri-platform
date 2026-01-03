import { Link } from 'react-router-dom';
import type { getCopy } from '../i18n';

type Copy = ReturnType<typeof getCopy>;

type LandingProps = {
	copy: Copy;
};

export default function Landing({ copy }: LandingProps) {
	return (
		<div className='page'>
			<section className='hero'>
				<div>
					<p className='eyebrow'>{copy.landing.eyebrow}</p>
					<h1>{copy.landing.title}</h1>
					<p className='lead'>{copy.landing.lead}</p>
					<div className='actions'>
						<Link className='btn primary' to='/login'>
							{copy.landing.actions.auth}
						</Link>
						<Link className='btn ghost' to='/dashboard'>
							{copy.landing.actions.dashboard}
						</Link>
					</div>
				</div>
				<div className='panel'>
					<h3>{copy.landing.howTo.title}</h3>
					<ol>
						{copy.landing.howTo.steps.map((step, idx) => (
							<li key={idx}>{step}</li>
						))}
					</ol>
				</div>
			</section>
		</div>
	);
}
