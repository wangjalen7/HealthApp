import countryNames from "./country-names.json";
import { useState } from "react";
import { Text, View, ScrollView } from "react-native";
import { TextInput } from "../../ui/text-input";
import { Pressable } from "../../ui/pressable";
import { colors } from "../../ui/theme";
import { ui, SetupButton } from "../onboarding/components";
import {
  getCountries,
  getCountryCallingCode,
  formattedPhone,
  type CountryCode,
} from "./phone-model";
export function PhoneField({
  country,
  setCountry,
  value,
  onChange,
  disabled = false,
}: {
  country: CountryCode;
  setCountry: (c: CountryCode) => void;
  value: string;
  onChange: (s: string) => void;
  disabled?: boolean;
}) {
  const [search, setSearch] = useState(""),
    [open, setOpen] = useState(false);
  const names = { of: (country: CountryCode) => countryNames[country] };
  const countries = getCountries().filter((c) =>
    (names.of(c) + " " + c + " +" + getCountryCallingCode(c))
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <View style={{ gap: 12 }}>
      <Text style={ui.label}>Country or region</Text>
      <SetupButton
        secondary
        disabled={disabled}
        label={
          (names.of(country) || country) + " +" + getCountryCallingCode(country)
        }
        onPress={() => setOpen(!open)}
      />
      {open ? (
        <View style={ui.surface}>
          <TextInput
            accessibilityLabel="Search countries or calling codes"
            style={ui.input}
            value={search}
            onChangeText={setSearch}
          />
          <ScrollView
            nestedScrollEnabled
            style={{ maxHeight: 220 }}
            keyboardShouldPersistTaps="handled"
          >
            {countries.map((c) => (
              <Pressable
                key={c}
                accessibilityRole="button"
                onPress={() => {
                  setCountry(c);
                  setOpen(false);
                  setSearch("");
                }}
                style={{ minHeight: 48, justifyContent: "center" }}
              >
                <Text style={{ color: colors.text, fontSize: 16 }}>
                  {names.of(c) || c} +{getCountryCallingCode(c)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
      <Text style={ui.label}>Phone number</Text>
      <TextInput
        accessibilityLabel="Phone number"
        editable={!disabled}
        value={value}
        onChangeText={(s) => onChange(formattedPhone(s, country))}
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
        autoCorrect={false}
        style={ui.input}
      />
    </View>
  );
}
