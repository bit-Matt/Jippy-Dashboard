"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { MapPin } from "lucide-react";

const SAMPLE_DIRECTIONS = [
  "",
  "",
];

export default function Simulator() {
  const [directions, setDirections] = useState<string[]>([]);

  const handleSimulate = () => {
    setDirections(SAMPLE_DIRECTIONS);
  };

  return (
    <div className="absolute top-2 left-6 z-99999 w-1/4">
      <Card>
        <CardHeader>
          <CardTitle>Simulator</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Start</Label>
              <InputGroup>
                <InputGroupInput
                  readOnly
                  value=""
                  placeholder="Starting address"
                />
                <InputGroupAddon align="inline-end" className="pr-2">
                  <InputGroupButton aria-label="Pin start location">
                    <MapPin />
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </div>
            <div className="space-y-2">
              <Label>End</Label>
              <InputGroup>
                <InputGroupInput
                  readOnly
                  value=""
                  placeholder="Destination address"
                />
                <InputGroupAddon align="inline-end" className="pr-2">
                  <InputGroupButton aria-label="Pin destination location">
                    <MapPin />
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </div>
          </div>

          <Button className="w-full" onClick={handleSimulate}>
						Simulate
          </Button>

          {directions.length > 0 && (
            <>
              <Separator />
              <div className="space-y-3">
                <Label>Directions</Label>
                <div className="space-y-2">
                  {directions.map((step, index) => (
                    <div
                      key={`${step}-${index}`}
                      className="flex items-start gap-3 rounded-lg border border-border bg-background p-3"
                    >
                      <span className="mt-1 block h-5 w-5 rounded-sm border border-border" />
                      <span className="text-sm">{step}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
