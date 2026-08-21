import { cn } from "@/lib/utils";

type NoriaLogoProps = {
	className?: string;
	markOnly?: boolean;
	variant?: "light" | "dark";
};

export function NoriaLogo({
	className,
	markOnly = false,
	variant = "light",
}: NoriaLogoProps) {
	const src = markOnly
		? `/brand/noria-isologo-${variant}.png`
		: `/brand/noria-logo-${variant}.png`;

	return (
		<img
			src={src}
			alt="Noria by AmsaCore"
			className={cn("block object-contain", className)}
		/>
	);
}
